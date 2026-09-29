import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateShape, validateFrames, filterFindings } from "./filter-tone.mjs";

// cwd 相対だと実行ディレクトリに依存して壊れるので、このテストファイル自身の
// 場所から解決する（どのディレクトリから node --test を叩いても通るように）。
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "filter-tone.mjs");

// 枠 A（open）と枠 B（details "移行の順序"）で別々の引用を持つ、判定役への
// 入力を模した枠の配列（frames-iter-<N>.json 相当）。
const FRAME_OPEN = { kind: "open", title: "", text: "採点できなかった候補に仮の点をつけるのをやめた。" };
const FRAME_DETAILS = { kind: "details", title: "移行の順序", text: "大幅に改善されました。" };
const FRAME_NUMBERED = { kind: "numbered", title: "", text: "1: 適切に処理する" };
const FRAMES = [FRAME_OPEN, FRAME_DETAILS, FRAME_NUMBERED];

test("引用が名指す枠の中に実在する AI っぽい指摘は残る", () => {
  const r = filterFindings(
    [{ kind: "details", title: "移行の順序", verdict: "AIっぽい", quote: "大幅に改善されました", reason: "誇張" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 1);
  assert.strictEqual(r.counts.dropped, 0);
  assert.strictEqual(r.counts.not_ai_like, 0);
});

test("っぽくないと判定されたものは not_ai_like に数え、dropped には数えない", () => {
  const r = filterFindings([{ kind: "open", title: "", verdict: "っぽくない", quote: "", reason: "" }], FRAMES);
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.counts.not_ai_like, 1);
  assert.strictEqual(r.counts.dropped, 0);
  assert.strictEqual(r.dropped[0].why, "AI っぽくないと判定された");
});

test("引用が無い指摘は捨てる", () => {
  const r = filterFindings(
    [{ kind: "open", title: "", verdict: "AIっぽい", quote: "   ", reason: "全体的に機械的" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.counts.dropped, 1);
  assert.strictEqual(r.dropped[0].why, "引用が無い");
});

test("引用の欄が無い指摘は捨てる", () => {
  const r = filterFindings([{ kind: "open", title: "", verdict: "AIっぽい", reason: "機械的" }], FRAMES);
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "引用が無い");
});

test("枠 A の引用が枠 B にしか無い場合は捨てる（枠をまたいだ誤認を防ぐ）", () => {
  // "大幅に改善されました" は FRAME_DETAILS（移行の順序）にしか無いが、
  // 指摘は FRAME_OPEN（open）を名指ししている。
  const r = filterFindings(
    [{ kind: "open", title: "", verdict: "AIっぽい", quote: "大幅に改善されました", reason: "誇張" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "引用が本文に無い");
});

test("引用がどの枠にも実在しない指摘は捨てる", () => {
  const r = filterFindings(
    [{ kind: "open", title: "", verdict: "AIっぽい", quote: "劇的に向上しました", reason: "誇張" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "引用が本文に無い");
});

test("名指しの枠（kind と title の組）が入力に無い指摘は捨てる", () => {
  const r = filterFindings(
    [{ kind: "details", title: "存在しない枠", verdict: "AIっぽい", quote: "大幅に改善されました", reason: "誇張" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "指摘が名指しする枠が入力に無い");
});

test("番号コメントの枠は自分の text の中の引用だけ拾う", () => {
  const r = filterFindings(
    [{ kind: "numbered", title: "", verdict: "AIっぽい", quote: "1: 適切に処理する", reason: "自己賛美" }],
    FRAMES,
  );
  assert.strictEqual(r.counts.kept, 1);
});

// レビュワーの再現ケース: numbered 3 件 + intent 2 件 + open 1 件。番号コメント・
// 意図コメントはどちらも title を持たないので、同じ kind を共有する枠が複数ある。
// buildFrameIndex が Map.set の後勝ちで畳んでいた旧実装だと、この 6 枠は
// kind+title の組が 3 種類（open, numbered, intent）しかないため index size が 3 に
// 潰れ、最後の numbered/intent 以外の枠の引用が全部「引用が本文に無い」で
// 誤って捨てられていた。
const MULTI_NUMBERED = [
  { kind: "numbered", title: "", text: "1: 入力を読む" },
  { kind: "numbered", title: "", text: "2: 採点する" },
  { kind: "numbered", title: "", text: "3: 台帳に書く" },
];
const MULTI_INTENT = [
  { kind: "intent", title: "", text: "ここは意図的に穴埋めを残している。" },
  { kind: "intent", title: "", text: "ここは互換性のために残した処理。" },
];
const MULTI_FRAMES = [FRAME_OPEN, ...MULTI_NUMBERED, ...MULTI_INTENT];

test("同じ種類の枠が複数あり、引用がそのうちどれかに出現すれば残る（レビュワーの再現ケース）", () => {
  const r = filterFindings(
    [
      { kind: "numbered", title: "", verdict: "AIっぽい", quote: "1: 入力を読む", reason: "自明" },
      { kind: "numbered", title: "", verdict: "AIっぽい", quote: "2: 採点する", reason: "自明" },
      { kind: "numbered", title: "", verdict: "AIっぽい", quote: "3: 台帳に書く", reason: "自明" },
      { kind: "intent", title: "", verdict: "AIっぽい", quote: "意図的に穴埋めを残している", reason: "冗長" },
      { kind: "intent", title: "", verdict: "AIっぽい", quote: "互換性のために残した処理", reason: "冗長" },
    ],
    MULTI_FRAMES,
  );
  assert.strictEqual(r.counts.kept, 5, JSON.stringify(r.dropped));
  assert.strictEqual(r.counts.dropped, 0);
});

test("open の枠から取った引用が numbered の枠にしか無い場合は捨てられる（種類をまたぐ誤りは防げている）", () => {
  const r = filterFindings(
    [{ kind: "open", title: "", verdict: "AIっぽい", quote: "2: 採点する", reason: "誤り" }],
    MULTI_FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "引用が本文に無い");
});

test("名指しする種類の枠が入力に 1 つも無い場合は捨てられる", () => {
  const r = filterFindings(
    [{ kind: "title", title: "", verdict: "AIっぽい", quote: "採点できなかった候補", reason: "誇張" }],
    MULTI_FRAMES,
  );
  assert.strictEqual(r.counts.kept, 0);
  assert.strictEqual(r.dropped[0].why, "指摘が名指しする枠が入力に無い");
});

test("全部捨てたら 0 件になり、not_ai_like と dropped が別に数えられる", () => {
  const r = filterFindings(
    [
      { kind: "open", title: "", verdict: "っぽくない", quote: "", reason: "" },
      { kind: "open", title: "", verdict: "AIっぽい", quote: "無い文", reason: "" },
    ],
    FRAMES,
  );
  assert.deepStrictEqual(r.kept, []);
  assert.strictEqual(r.counts.not_ai_like, 1);
  assert.strictEqual(r.counts.dropped, 1);
});

test("findings が配列でなければ throw する", () => {
  assert.throws(() => validateShape({}), /findings/);
  assert.throws(() => validateShape(null), /findings/);
  assert.throws(() => validateShape([]), /findings/);
});

test("findings が配列なら返す", () => {
  assert.deepStrictEqual(validateShape({ findings: [] }), []);
});

test("validateFrames は配列でなければ throw する", () => {
  assert.throws(() => validateFrames({}), /配列ではありません/);
  assert.throws(() => validateFrames(null), /配列ではありません/);
});

test("validateFrames は配列ならそのまま返す", () => {
  assert.deepStrictEqual(validateFrames(FRAMES), FRAMES);
});

test("CLI は形が壊れた findings ファイルに対して異常終了し、エラーメッセージに filter-tone: が 1 回だけ現れる", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "filter-tone-test-"));
  try {
    const findingsFile = join(tmpDir, "findings.json");
    const inputFile = join(tmpDir, "input.json");

    // 壊れた JSON: findings 配列が無い
    writeFileSync(findingsFile, JSON.stringify({ data: [] }));
    writeFileSync(inputFile, JSON.stringify(FRAMES));

    // CLI を実行してエラーを受け取る
    let errorThrown = false;
    let stderr = "";
    try {
      execFileSync(process.execPath, [CLI_PATH, "--findings-file", findingsFile, "--input-file", inputFile], {
        encoding: "utf8",
      });
    } catch (err) {
      errorThrown = true;
      stderr = err.stderr;
    }

    // 異常終了し、エラーメッセージが正しいことを確認
    assert.strictEqual(errorThrown, true, "CLI は終了コード 0 以外で終わるべき");
    assert.ok(stderr.includes("filter-tone:"), "stderr に filter-tone: が含まれるべき");
    assert.strictEqual(
      (stderr.match(/filter-tone:/g) || []).length,
      1,
      "filter-tone: は 1 回だけ現れるべき（2 回以上は二重付けの証拠）",
    );
    assert.ok(!stderr.includes("filter-tone: filter-tone:"), "二重の filter-tone: を含まないべき");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test("CLI は正常な入力に対して終了コード 0 で JSON を標準出力に出す", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "filter-tone-test-"));
  try {
    const findingsFile = join(tmpDir, "findings.json");
    const inputFile = join(tmpDir, "input.json");

    // 正常な入力
    writeFileSync(
      findingsFile,
      JSON.stringify({
        findings: [
          { kind: "details", title: "移行の順序", verdict: "AIっぽい", quote: "大幅に改善されました", reason: "誇張" },
        ],
      }),
    );
    writeFileSync(inputFile, JSON.stringify(FRAMES));

    // CLI を実行
    const output = execFileSync(process.execPath, [CLI_PATH, "--findings-file", findingsFile, "--input-file", inputFile], {
      encoding: "utf8",
    });

    // 出力が JSON で期待通りであることを確認
    const result = JSON.parse(output);
    assert.strictEqual(result.counts.kept, 1);
    assert.strictEqual(result.counts.dropped, 0);
    assert.strictEqual(result.kept.length, 1);
    assert.strictEqual(result.dropped.length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
