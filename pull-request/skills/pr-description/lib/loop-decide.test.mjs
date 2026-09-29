import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decide, collect, MAX_ITER } from "./loop-decide.mjs";

const base = { iter: 1, mode: "light", skeleton: 0, reword: 0, review_findings: 0, tone_rewrites: 0 };

test("残りが無ければ止めて投稿する", () => {
  assert.deepStrictEqual(decide(base), { action: "STOP", publish: true, reason: "clean" });
});

test("残りがあって上限前なら続行する", () => {
  const r = decide({ ...base, reword: 1 });
  assert.strictEqual(r.action, "CONTINUE");
  assert.strictEqual(r.publish, false);
});

test("骨格だけが残っていても上限前なら続行する", () => {
  // remaining は skeleton + reword + review_findings の 3 項の和。reword 単独は
  // 上のテストで押さえているので、他の項も単独で続行させることを直接確認する
  const r = decide({ ...base, skeleton: 1 });
  assert.strictEqual(r.action, "CONTINUE");
  assert.strictEqual(r.publish, false);
});

test("セルフレビューの未決着だけが残っていても上限前なら続行する", () => {
  const r = decide({ ...base, review_findings: 1 });
  assert.strictEqual(r.action, "CONTINUE");
  assert.strictEqual(r.publish, false);
});

test("上限ちょうどでも残りが無ければ上限到達より先に clean で止める", () => {
  // clean 判定と上限判定の if を入れ替えると、この境界だけ黙って
  // max_iter_reached_publishable になる。reason ラベルはインタフェースの
  // 一部なので、上限ちょうど×残り0の組み合わせを直接押さえる
  assert.deepStrictEqual(decide({ ...base, iter: MAX_ITER.light }), {
    action: "STOP",
    publish: true,
    reason: "clean",
  });
});

test("軽量モードの上限は 3", () => {
  assert.strictEqual(MAX_ITER.light, 3);
  assert.strictEqual(decide({ ...base, iter: 2, reword: 1 }).action, "CONTINUE");
  assert.strictEqual(decide({ ...base, iter: 3, reword: 1 }).action, "STOP");
});

test("本気モードの上限は 4", () => {
  assert.strictEqual(MAX_ITER.serious, 4);
  assert.strictEqual(decide({ ...base, mode: "serious", iter: 3, reword: 1 }).action, "CONTINUE");
  assert.strictEqual(decide({ ...base, mode: "serious", iter: 4, reword: 1 }).action, "STOP");
});

test("上限に達して言い換えだけ残っていたら投稿する", () => {
  const r = decide({ ...base, iter: 3, reword: 2 });
  assert.strictEqual(r.action, "STOP");
  assert.strictEqual(r.publish, true);
  assert.strictEqual(r.reason, "max_iter_reached_publishable");
});

test("上限に達して骨格が残っていたら投稿しない", () => {
  const r = decide({ ...base, iter: 3, skeleton: 1 });
  assert.strictEqual(r.action, "STOP");
  assert.strictEqual(r.publish, false);
  assert.strictEqual(r.reason, "max_iter_reached");
});

test("上限に達してセルフレビューの未決着が残っていたら投稿しない", () => {
  const r = decide({ ...base, iter: 3, review_findings: 1 });
  assert.strictEqual(r.publish, false);
  assert.strictEqual(r.reason, "max_iter_reached");
});

test("語り口の書き直しがあれば残りが無くても続行する", () => {
  const r = decide({ ...base, mode: "serious", tone_rewrites: 3 });
  assert.strictEqual(r.action, "CONTINUE");
});

test("語り口の書き直しがあって上限に達していたら投稿する", () => {
  const r = decide({ ...base, mode: "serious", iter: 4, tone_rewrites: 3 });
  assert.strictEqual(r.action, "STOP");
  assert.strictEqual(r.publish, true);
});

test("知らないモードは throw する", () => {
  assert.throws(() => decide({ ...base, mode: "turbo" }), /mode/);
});

test("数値でない入力は throw する", () => {
  assert.throws(() => decide({ ...base, skeleton: undefined }), /skeleton/);
  assert.throws(() => decide({ ...base, reword: "1" }), /reword/);
  assert.throws(() => decide({ ...base, review_findings: null }), /review_findings/);
});

// --- decide の追加境界（旧テストからの引き継ぎ） ---

test("iter を渡さないと throw する", () => {
  assert.throws(
    () => decide({ ...base, iter: undefined }),
    /loop-decide: iter は有限な数値である必要があります/
  );
});

test("iter に文字列を渡すと throw する", () => {
  assert.throws(
    () => decide({ ...base, iter: "1" }),
    /loop-decide: iter は有限な数値である必要があります/
  );
});

test("iter: 0 は正常に動く", () => {
  assert.deepStrictEqual(decide({ ...base, iter: 0 }), {
    action: "STOP",
    publish: true,
    reason: "clean",
  });
});

test("max_iter という名前の引数を渡しても無視され MAX_ITER が使われる", () => {
  // 上限を 1 に縮めようとしても効かない
  assert.strictEqual(decide({ ...base, iter: 1, reword: 1, max_iter: 1 }).action, "CONTINUE");
  // 上限を伸ばそうとしても効かない
  assert.strictEqual(
    decide({ ...base, iter: 3, skeleton: 1, max_iter: 99 }).reason,
    "max_iter_reached"
  );
});

// --- collect ---

function makeWorkdir() {
  return mkdtempSync(join(tmpdir(), "pr-description-loop-decide-"));
}

/** 台帳・表層検出の出力・モードファイルを書いた WORKDIR を作る */
function seed(workdir, { runId = "20260824-120000", mode = "light", iters = [], slop = {} } = {}) {
  writeFileSync(join(workdir, "run-id"), `${runId}\n`, "utf8");
  writeFileSync(join(workdir, "level.txt"), `${mode}\n`, "utf8");
  const ledgerDir = join(workdir, "ledger", runId);
  mkdirSync(ledgerDir, { recursive: true });
  for (const { n, review_findings, tone } of iters) {
    writeFileSync(
      join(ledgerDir, `iter-${n}.json`),
      JSON.stringify({ iter: n, review_findings, ...(tone ? { tone } : {}), entries: [] }),
      "utf8"
    );
  }
  for (const [n, violations] of Object.entries(slop)) {
    writeFileSync(join(ledgerDir, `slop-iter-${n}.json`), JSON.stringify({ violations }), "utf8");
  }
  return ledgerDir;
}

test("collect は台帳ファイルの個数から iter を数える", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      iters: [
        { n: 1, review_findings: 0 },
        { n: 2, review_findings: 0 },
      ],
      slop: { 1: [], 2: [] },
    });
    assert.strictEqual(collect(workdir).iter, 2);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は今回の実行 ID のディレクトリだけを見る", () => {
  const workdir = makeWorkdir();
  try {
    // 前回の実行の台帳が 3 周分残っていても、今回の実行の 1 周だけを数える
    const old = join(workdir, "ledger", "20260101-000000");
    mkdirSync(old, { recursive: true });
    for (const n of [1, 2, 3]) {
      writeFileSync(join(old, `iter-${n}.json`), JSON.stringify({ iter: n, review_findings: 0 }), "utf8");
    }
    seed(workdir, { iters: [{ n: 1, review_findings: 0 }], slop: { 1: [] } });
    assert.strictEqual(collect(workdir).iter, 1);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は前回実行の slop-iter-<N>.json を読まずに throw する", () => {
  const workdir = makeWorkdir();
  try {
    // 前回の実行には slop-iter-1.json が残っているが、今回の実行 ID のディレクトリには無い
    const old = join(workdir, "ledger", "20260101-000000");
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, "iter-1.json"), JSON.stringify({ iter: 1, review_findings: 0 }), "utf8");
    writeFileSync(join(old, "slop-iter-1.json"), JSON.stringify({ violations: [] }), "utf8");
    seed(workdir, { iters: [{ n: 1, review_findings: 0 }], slop: {} });
    assert.throws(() => collect(workdir), /loop-decide: 表層検出の出力がありません: .*slop-iter-1\.json/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳以外のファイルを iter に数えない", () => {
  const workdir = makeWorkdir();
  try {
    const ledgerDir = seed(workdir, { iters: [{ n: 1, review_findings: 0 }], slop: { 1: [] } });
    writeFileSync(join(ledgerDir, "notes.md"), "メモ", "utf8");
    writeFileSync(join(ledgerDir, "iter-x.json"), "{}", "utf8");
    assert.strictEqual(collect(workdir).iter, 1);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は kind 別に骨格と言い換えの件数を数え、装飾は数えない", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      mode: "serious",
      iters: [{ n: 1, review_findings: 2 }],
      slop: {
        1: [
          { rule: "絵文字を全面禁止", detail: "a", kind: "装飾" },
          { rule: "見出し欠落", detail: "b", kind: "骨格" },
          { rule: "定型文A", detail: "c", kind: "言い換え" },
          { rule: "定型文B", detail: "d", kind: "言い換え" },
        ],
      },
    });
    assert.deepStrictEqual(collect(workdir), {
      iter: 1,
      mode: "serious",
      skeleton: 1,
      reword: 2,
      review_findings: 2,
      tone_rewrites: 0,
      compress_unresolved: 0,
      compress_applied: 0,
    });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は今回の iter に対応する表層検出の出力を読む", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      iters: [
        { n: 1, review_findings: 0 },
        { n: 2, review_findings: 0 },
      ],
      slop: { 1: [{ rule: "禁止語", detail: "a", kind: "骨格" }], 2: [] },
    });
    assert.deepStrictEqual(collect(workdir), {
      iter: 2,
      mode: "light",
      skeleton: 0,
      reword: 0,
      review_findings: 0,
      tone_rewrites: 0,
      compress_unresolved: 0,
      compress_applied: 0,
    });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳の tone.rewritten を読む", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      mode: "serious",
      iters: [{ n: 1, review_findings: 0, tone: { rewritten: 3 } }],
      slop: { 1: [] },
    });
    assert.strictEqual(collect(workdir).tone_rewrites, 3);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳の tone.unresolved が 0 以外だと throw する", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      mode: "serious",
      iters: [{ n: 1, review_findings: 0, tone: { rewritten: 1, unresolved: 1 } }],
      slop: { 1: [] },
    });
    assert.throws(() => collect(workdir), /loop-decide: 台帳の tone\.unresolved が 0 ではありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳の tone.unresolved が 0 なら通る", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      mode: "serious",
      iters: [{ n: 1, review_findings: 0, tone: { rewritten: 1, unresolved: 0 } }],
      slop: { 1: [] },
    });
    assert.strictEqual(collect(workdir).tone_rewrites, 1);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は tone.unresolved を書いていない周回では throw しない", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      mode: "serious",
      iters: [{ n: 1, review_findings: 0, tone: { rewritten: 3 } }],
      slop: { 1: [] },
    });
    assert.strictEqual(collect(workdir).tone_rewrites, 3);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は run-id が無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    assert.throws(() => collect(workdir), /loop-decide: 実行 ID のファイルがありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳ディレクトリが無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    writeFileSync(join(workdir, "run-id"), "20260824-120000", "utf8");
    assert.throws(() => collect(workdir), /loop-decide: 台帳ディレクトリがありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は台帳ファイルが 1 つも無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, { iters: [], slop: {} });
    assert.throws(() => collect(workdir), /台帳ファイル（iter-<N>\.json）が 1 つもありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は表層検出の出力が無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, { iters: [{ n: 1, review_findings: 0 }], slop: {} });
    assert.throws(() => collect(workdir), /loop-decide: 表層検出の出力がありません: .*slop-iter-1\.json/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は表層検出の出力に violations 配列が無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    const ledgerDir = seed(workdir, { iters: [{ n: 1, review_findings: 0 }] });
    writeFileSync(join(ledgerDir, "slop-iter-1.json"), JSON.stringify({ violations: 0 }), "utf8");
    assert.throws(() => collect(workdir), /violations 配列がありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は表層検出の違反に kind が無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    const ledgerDir = seed(workdir, { iters: [{ n: 1, review_findings: 0 }] });
    // Task 2 より前の古い出力（kind 無し）を模す。黙って通すと骨格違反が
    // 投稿ゲートをすり抜けかねないので throw で気付けるようにする。
    writeFileSync(
      join(ledgerDir, "slop-iter-1.json"),
      JSON.stringify({ violations: [{ rule: "禁止語", detail: "a" }] }),
      "utf8"
    );
    assert.throws(() => collect(workdir), /表層検出の違反に分類（kind）がありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect は level.txt が無いと throw する", () => {
  const workdir = makeWorkdir();
  try {
    const runId = "20260824-120000";
    writeFileSync(join(workdir, "run-id"), `${runId}\n`, "utf8");
    const ledgerDir = join(workdir, "ledger", runId);
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(join(ledgerDir, "iter-1.json"), JSON.stringify({ iter: 1, review_findings: 0 }), "utf8");
    writeFileSync(join(ledgerDir, "slop-iter-1.json"), JSON.stringify({ violations: [] }), "utf8");
    assert.throws(() => collect(workdir), /loop-decide: モードのファイルがありません/);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("collect が返した値は decide にそのまま渡せる", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, {
      iters: [{ n: 1, review_findings: 0 }],
      slop: { 1: [{ rule: "定型文", detail: "a", kind: "言い換え" }] },
    });
    assert.strictEqual(decide(collect(workdir)).action, "CONTINUE");
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("台帳の review_findings が数値でないと decide が throw する", () => {
  const workdir = makeWorkdir();
  try {
    seed(workdir, { iters: [{ n: 1, review_findings: "0" }], slop: { 1: [] } });
    assert.throws(
      () => decide(collect(workdir)),
      /loop-decide: review_findings は有限な数値である必要があります/
    );
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("圧縮の未決着が残っていれば続行する", () => {
  const r = decide({ ...base, compress_unresolved: 1 });
  assert.strictEqual(r.action, "CONTINUE");
  assert.strictEqual(r.publish, false);
});

test("圧縮を反映した周回の後は、残りが 0 でも続行する", () => {
  const r = decide({ ...base, compress_applied: 1 });
  assert.strictEqual(r.action, "CONTINUE");
  assert.strictEqual(r.reason, "has_findings");
});

test("圧縮の反映も語り口の書き直しも 0 で残りも 0 なら止めて投稿する", () => {
  const r = decide({ ...base, tone_rewrites: 0, compress_applied: 0 });
  assert.deepStrictEqual(r, { action: "STOP", publish: true, reason: "clean" });
});

test("圧縮の未決着だけが残って上限に達したら投稿する", () => {
  const r = decide({ ...base, mode: "serious", iter: 4, compress_unresolved: 2 });
  assert.strictEqual(r.action, "STOP");
  assert.strictEqual(r.publish, true);
  assert.strictEqual(r.reason, "max_iter_reached_publishable");
});

test("圧縮の未決着が残っていても骨格が残っていれば投稿しない", () => {
  const r = decide({ ...base, mode: "serious", iter: 4, compress_unresolved: 2, skeleton: 1 });
  assert.strictEqual(r.publish, false);
  assert.strictEqual(r.reason, "max_iter_reached");
});

test("圧縮の判定材料が数値でなければ throw する", () => {
  assert.throws(() => decide({ ...base, compress_unresolved: "1" }), /compress_unresolved/);
  assert.throws(() => decide({ ...base, compress_applied: null }), /compress_applied/);
});

test("台帳に compress キーが無い周回は 0 として集める", () => {
  const workdir = mkdtempSync(join(tmpdir(), "pr-desc-loop-"));
  try {
    writeFileSync(join(workdir, "run-id"), "20260908-120000");
    writeFileSync(join(workdir, "level.txt"), "serious");
    const ledgerDir = join(workdir, "ledger", "20260908-120000");
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(join(ledgerDir, "iter-1.json"), JSON.stringify({ iter: 1, review_findings: 0 }));
    writeFileSync(join(ledgerDir, "slop-iter-1.json"), JSON.stringify({ violations: [] }));
    const got = collect(workdir);
    assert.strictEqual(got.compress_unresolved, 0);
    assert.strictEqual(got.compress_applied, 0);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});

test("台帳の compress から未決着と反映件数を集める", () => {
  const workdir = mkdtempSync(join(tmpdir(), "pr-desc-loop-"));
  try {
    writeFileSync(join(workdir, "run-id"), "20260908-120000");
    writeFileSync(join(workdir, "level.txt"), "serious");
    const ledgerDir = join(workdir, "ledger", "20260908-120000");
    mkdirSync(ledgerDir, { recursive: true });
    writeFileSync(
      join(ledgerDir, "iter-1.json"),
      JSON.stringify({
        iter: 1,
        review_findings: 0,
        compress: { findings: 5, applied: 3, kept_with_reason: 1, unresolved: 1, dropped: { gate1: 0, gate2: 1, gate3: 0 } },
      }),
    );
    writeFileSync(join(ledgerDir, "slop-iter-1.json"), JSON.stringify({ violations: [] }));
    const got = collect(workdir);
    assert.strictEqual(got.compress_unresolved, 1);
    assert.strictEqual(got.compress_applied, 3);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});
