import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNumber, commentUrl, buildNavLine, stripNavTail, planEdits, summarize, run } from "./nav-links.mjs";
import { COMMENT_MARKER } from "./comment-marker.mjs";

const CLI_PATH = fileURLToPath(new URL("./nav-links.mjs", import.meta.url));

const REPO = { owner: "example-org", repo: "example-repo", pr: "315" };
const url = (id) => `https://github.com/example-org/example-repo/pull/315/changes#r${id}`;

test("先頭が 数字: の本文から番号を読む", () => {
  assert.strictEqual(parseNumber("2: 候補を検証する"), 2);
  assert.strictEqual(parseNumber("12: 二桁"), 12);
});

test("番号で始まらない本文は null を返す", () => {
  assert.strictEqual(parseNumber("今までの処理を消していないのは"), null);
  assert.strictEqual(parseNumber("v2: 版の話"), null);
  assert.strictEqual(parseNumber("2 候補"), null);
});

test("コメントの URL は changes#r<ID> の形になる", () => {
  assert.strictEqual(commentUrl({ ...REPO, id: 4133082090 }), url(4133082090));
});

const link = (label, id) => `[${label}](${url(id)})`;
const ids = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const OLD_LINE = `${link("◀前", 101)} ${link("次▶", 103)}`;
const NEW_LINE_2OF3 = `${link("◀", 101)} ${link("1", 101)} 2 ${link("3", 103)} ${link("▶", 103)}`;

test("4 件の 2 番目は ◀ 全番号(自分は数字のみ) ▶ の順に並ぶ", () => {
  assert.strictEqual(
    buildNavLine({ ...REPO, ids: [101, 102, 103, 104], index: 1 }),
    `${link("◀", 101)} ${link("1", 101)} 2 ${link("3", 103)} ${link("4", 104)} ${link("▶", 103)}`,
  );
});

test("1 番目には ◀ が無く、最後には ▶ が無い", () => {
  assert.strictEqual(
    buildNavLine({ ...REPO, ids: [101, 102, 103, 104], index: 0 }),
    `1 ${link("2", 102)} ${link("3", 103)} ${link("4", 104)} ${link("▶", 102)}`,
  );
  assert.strictEqual(
    buildNavLine({ ...REPO, ids: [101, 102, 103, 104], index: 3 }),
    `${link("◀", 103)} ${link("1", 101)} ${link("2", 102)} ${link("3", 103)} 4`,
  );
});

test("2 件のときの 1 番と 2 番", () => {
  assert.strictEqual(buildNavLine({ ...REPO, ids: [101, 102], index: 0 }), `1 ${link("2", 102)} ${link("▶", 102)}`);
  assert.strictEqual(buildNavLine({ ...REPO, ids: [101, 102], index: 1 }), `${link("◀", 101)} ${link("1", 101)} 2`);
});

test("自分の番号はリンクにならず、旧形式の 前 次 の文字も出ない", () => {
  const line = buildNavLine({ ...REPO, ids: [101, 102, 103], index: 1 });
  assert.strictEqual(line, NEW_LINE_2OF3);
  assert.ok(!line.includes("[2]("));
  assert.ok(!line.includes("前") && !line.includes("次"));
});

test("リンクが 1 件以下なら空文字", () => {
  assert.strictEqual(buildNavLine({ ...REPO, ids: [101], index: 0 }), "");
  assert.strictEqual(buildNavLine({ ...REPO, ids: [], index: 0 }), "");
});

test("要素の区切りは半角空白 1 つだけ", () => {
  const line = buildNavLine({ ...REPO, ids: [101, 102, 103], index: 0 });
  assert.ok(!/ {2}|[\n　]/.test(line));
});

test("12 件の 10 番目と最後で、二桁の番号も数値順に並ぶ", () => {
  const all = ids(200, 12);
  const nums = (skip) => all.map((id, i) => (i + 1 === skip ? String(i + 1) : link(String(i + 1), id)));
  assert.strictEqual(
    buildNavLine({ ...REPO, ids: all, index: 9 }),
    [link("◀", 208), ...nums(10), link("▶", 210)].join(" "),
  );
  assert.strictEqual(
    buildNavLine({ ...REPO, ids: all, index: 11 }),
    [link("◀", 210), ...nums(12)].join(" "),
  );
});

test("番号の数に上限は無く、30 件でも全件を並べる", () => {
  const line = buildNavLine({ ...REPO, ids: ids(300, 30), index: 0 });
  assert.strictEqual(line.match(/\]\(/g).length, 30);
  assert.ok(line.startsWith(`1 ${link("2", 301)} `));
  assert.ok(line.endsWith(link("▶", 301)));
});

test("末尾が旧形式のリンク行なら落とす", () => {
  assert.strictEqual(stripNavTail(`2: 検証\n\n${OLD_LINE}`), "2: 検証");
  assert.strictEqual(stripNavTail(`1: 準備\n\n${link("次▶", 102)}`), "1: 準備");
  assert.strictEqual(stripNavTail(`3: 後片付け\n\n${link("◀前", 102)}`), "3: 後片付け");
});

test("末尾が新形式のリンク行なら落とす(1 番・最後・2 件・通常)", () => {
  assert.strictEqual(stripNavTail(`2: 検証\n\n${NEW_LINE_2OF3}`), "2: 検証");
  assert.strictEqual(stripNavTail(`1: 準備\n\n1 ${link("2", 102)} ${link("▶", 102)}`), "1: 準備");
  assert.strictEqual(
    stripNavTail(`3: 後片付け\n\n${link("◀", 102)} ${link("1", 101)} ${link("2", 102)} 3`),
    "3: 後片付け",
  );
  assert.strictEqual(stripNavTail(`2: b\n\n${link("◀", 101)} ${link("1", 101)} 2`), "2: b");
});

test("リンク行の後ろの空白や改行も落とす", () => {
  assert.strictEqual(stripNavTail(`2: 検証\n\n${NEW_LINE_2OF3}\n\n  `), "2: 検証");
});

test("リンク行が無い本文は末尾の空白だけ落とす", () => {
  assert.strictEqual(stripNavTail("2: 検証\n\n詳細です。\n\n"), "2: 検証\n\n詳細です。");
  assert.strictEqual(stripNavTail("2: 検証  "), "2: 検証");
});

test("本文の途中にある [◀](x) は落とさない", () => {
  const body = "2: [◀](x) を使う例\n\n続きの説明";
  assert.strictEqual(stripNavTail(body), body);
});

test("リンク行そっくりの段落の後ろに別の段落が続くなら落とさない", () => {
  const withText = `2: 検証\n\n${NEW_LINE_2OF3}\n\n補足`;
  assert.strictEqual(stripNavTail(withText), withText);
  const withNumber = `1: 手順\n\n${NEW_LINE_2OF3}\n\n42`;
  assert.strictEqual(stripNavTail(withNumber), withNumber);
});

test("数字だけの段落で終わる本文は落とさない", () => {
  assert.strictEqual(stripNavTail("1: 手順\n\n42"), "1: 手順\n\n42");
  assert.strictEqual(stripNavTail("1: 手順\n\n1 2 3"), "1: 手順\n\n1 2 3");
});

test("空行なしで本文に続くリンク行は落とさない", () => {
  const body = `2: 検証\n${NEW_LINE_2OF3}`;
  assert.strictEqual(stripNavTail(body), body);
});

test("stripNavTail を 2 回かけても 1 回と同じ", () => {
  const once = stripNavTail(`2: 検証\n\n${NEW_LINE_2OF3}`);
  assert.strictEqual(stripNavTail(once), once);
});

test("4 件を入力順に関わらず番号順で全件編集する", () => {
  const comments = [
    { id: 104, body: "4: d" },
    { id: 102, body: "2: b" },
    { id: 101, body: "1: a" },
    { id: 103, body: "3: c" },
  ];
  const edits = planEdits({ ...REPO, comments });
  const l = (label, id) => link(label, id);
  assert.deepStrictEqual(edits, [
    { id: 101, body: `1: a\n\n1 ${l("2", 102)} ${l("3", 103)} ${l("4", 104)} ${l("▶", 102)}` },
    { id: 102, body: `2: b\n\n${l("◀", 101)} ${l("1", 101)} 2 ${l("3", 103)} ${l("4", 104)} ${l("▶", 103)}` },
    { id: 103, body: `3: c\n\n${l("◀", 102)} ${l("1", 101)} ${l("2", 102)} 3 ${l("4", 104)} ${l("▶", 104)}` },
    { id: 104, body: `4: d\n\n${l("◀", 103)} ${l("1", 101)} ${l("2", 102)} ${l("3", 103)} 4` },
  ]);
});

test("自分の番号はリンクにならず、1 番に ◀ が無く最後に ▶ が無い", () => {
  const comments = [1, 2, 3].map((n) => ({ id: 100 + n, body: `${n}: x` }));
  const [e1, e2, e3] = planEdits({ ...REPO, comments });
  assert.ok(!e1.body.includes("[1](") && !e1.body.includes("[◀]"));
  assert.ok(!e2.body.includes("[2]("));
  assert.ok(!e3.body.includes("[3](") && !e3.body.includes("[▶]"));
  assert.ok(e1.body.includes("[2](") && e1.body.includes("[3]("));
});

test("2 件のとき", () => {
  const edits = planEdits({ ...REPO, comments: [{ id: 101, body: "1: a" }, { id: 102, body: "2: b" }] });
  assert.deepStrictEqual(edits, [
    { id: 101, body: `1: a\n\n1 ${link("2", 102)} ${link("▶", 102)}` },
    { id: 102, body: `2: b\n\n${link("◀", 101)} ${link("1", 101)} 2` },
  ]);
});

test("二桁の番号も数値として並べる", () => {
  const comments = Array.from({ length: 11 }, (_, i) => ({ id: 400 + i, body: `${i + 1}: 本文` }));
  const order = [10, 2, 11, 1, 3, 4, 5, 6, 7, 8, 9].map((n) => comments[n - 1]);
  const edits = planEdits({ ...REPO, comments: order });
  assert.deepStrictEqual(edits.map((e) => e.id), comments.map((c) => c.id));
  const nums = comments.map((c, i) => (i === 9 ? "10" : link(String(i + 1), c.id)));
  assert.ok(edits[9].body.endsWith(`${link("◀", 408)} ${nums.slice(0, 11).join(" ")} ${link("▶", 410)}`));
  assert.ok(edits[10].body.includes(link("◀", 409)));
  assert.ok(!edits[10].body.includes("[▶]"));
});

test("意図コメントや番号で始まらない本文は並びにも編集対象にも入れない", () => {
  const comments = [
    { id: 101, body: "1: a" },
    { id: 900, body: "意図: 後で直す" },
    { id: 901, body: "メモ 2: b" },
    { id: 102, body: "2: b" },
  ];
  const edits = planEdits({ ...REPO, comments });
  assert.deepStrictEqual(edits, [
    { id: 101, body: `1: a\n\n1 ${link("2", 102)} ${link("▶", 102)}` },
    { id: 102, body: `2: b\n\n${link("◀", 101)} ${link("1", 101)} 2` },
  ]);
});

test("番号コメントが 1 件以下なら何も編集しない", () => {
  assert.deepStrictEqual(planEdits({ ...REPO, comments: [{ id: 101, body: "1: a" }, { id: 900, body: "意図: x" }] }), []);
  assert.deepStrictEqual(planEdits({ ...REPO, comments: [{ id: 900, body: "意図: x" }] }), []);
  assert.deepStrictEqual(planEdits({ ...REPO, comments: [] }), []);
});

test("末尾が旧形式のリンク行の本文に適用すると、新形式 1 行だけになる", () => {
  const comments = [
    { id: 101, body: `1: a\n\n${link("次▶", 102)}` },
    { id: 102, body: `2: b\n\n${link("◀前", 101)}` },
  ];
  const edits = planEdits({ ...REPO, comments });
  assert.deepStrictEqual(edits, [
    { id: 101, body: `1: a\n\n1 ${link("2", 102)} ${link("▶", 102)}` },
    { id: 102, body: `2: b\n\n${link("◀", 101)} ${link("1", 101)} 2` },
  ]);
  assert.ok(edits.every((e) => !e.body.includes("◀前") && !e.body.includes("次▶")));
});

test("末尾が新形式のリンク行の本文に再適用しても内容が変わらない", () => {
  const first = planEdits({ ...REPO, comments: [1, 2, 3].map((n) => ({ id: 100 + n, body: `${n}: x` })) });
  assert.deepStrictEqual(planEdits({ ...REPO, comments: first }), first);
});

test("本文の途中の [◀](x) や数字だけの末尾段落は落とさない", () => {
  const edits = planEdits({
    ...REPO,
    comments: [{ id: 101, body: "1: [◀](x) の例\n\n続き" }, { id: 102, body: "2: 手順\n\n42" }],
  });
  assert.strictEqual(edits[0].body, `1: [◀](x) の例\n\n続き\n\n1 ${link("2", 102)} ${link("▶", 102)}`);
  assert.strictEqual(edits[1].body, `2: 手順\n\n42\n\n${link("◀", 101)} ${link("1", 101)} 2`);
});

test("本文末尾の改行は落としてから空行 1 つで区切る", () => {
  const edits = planEdits({ ...REPO, comments: [{ id: 10, body: "1: 一番\n" }, { id: 20, body: "2: 二番" }] });
  assert.strictEqual(edits[0].body, `1: 一番\n\n1 ${link("2", 20)} ${link("▶", 20)}`);
});

test("元の本文とリンク行の間は空行 1 つだけ", () => {
  const edits = planEdits({ ...REPO, comments: [{ id: 101, body: "1: a" }, { id: 102, body: "2: b" }] });
  edits.forEach((e) => assert.ok(/^\d: [ab]\n\n[^\n]+$/.test(e.body)));
});


test("集計は成功と失敗を数え、失敗の理由を残す", () => {
  const s = summarize({
    planned: 3,
    results: [{ id: 1, ok: true }, { id: 2, ok: false, reason: "HTTP 404" }, { id: 3, ok: true }],
  });
  assert.deepStrictEqual(s, { total: 3, linked: 2, failed: 1, failures: [{ id: 2, reason: "HTTP 404" }] });
});

test("結果が planned より少ないときは、足りない分を失敗に数える", () => {
  const s = summarize({ planned: 3, results: [{ id: 1, ok: true }] });
  assert.strictEqual(s.failed, 2);
  assert.strictEqual(s.linked, 1);
});

// gh の偽物。呼ばれた引数を記録し、パスに応じて応答を返す。
function fakeGh({ reviews = [], comments = [], login = "me", failPatch = [], failList = false } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const path = args.find((a) => a.startsWith("repos/") || a === "user");
    if (path === "user") return `${login}\n`;
    if (path === "repos/{owner}/{repo}") return JSON.stringify({ owner: "example-org", repo: "example-repo" });
    if (/\/reviews\/\d+\/comments$/.test(path)) {
      if (failList) throw Object.assign(new Error("list failed"), { stderr: "HTTP 500" });
      return JSON.stringify(comments);
    }
    if (/\/reviews$/.test(path)) return JSON.stringify(reviews);
    if (/\/pulls\/comments\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      if (failPatch.includes(id)) throw Object.assign(new Error("patch failed"), { stderr: "HTTP 404" });
      return "{}";
    }
    throw new Error(`unexpected gh call: ${args.join(" ")}`);
  };
  return { gh, calls };
}

const patchCalls = (calls) => calls.filter((a) => a.includes("PATCH"));

test("review ID が渡されたら、その review のコメントだけを編集する", () => {
  const { gh, calls } = fakeGh({
    comments: [{ id: 10, body: "1: 一番" }, { id: 20, body: "2: 二番" }],
  });
  const r = run({ pr: "315", reviewId: "77", gh });
  assert.deepStrictEqual(
    { ok: r.ok, total: r.total, linked: r.linked, failed: r.failed },
    { ok: true, total: 2, linked: 2, failed: 0 },
  );
  assert.ok(calls.some((a) => a.includes("repos/{owner}/{repo}/pulls/315/reviews/77/comments")));
  const bodies = patchCalls(calls).map((a) => a[a.indexOf("-f") + 1]);
  assert.deepStrictEqual(bodies, [
    `body=1: 一番\n\n1 ${link("2", 20)} ${link("▶", 20)}`,
    `body=2: 二番\n\n${link("◀", 10)} ${link("1", 10)} 2`,
  ]);
});

test("意図コメントには gh の編集を呼ばない", () => {
  const { gh, calls } = fakeGh({
    comments: [{ id: 10, body: "1: a" }, { id: 20, body: "2: b" }, { id: 90, body: "意図: x" }],
  });
  run({ pr: "315", reviewId: "77", gh });
  const patched = patchCalls(calls).map((a) => a.find((x) => /pulls\/comments\/\d+$/.test(x)));
  assert.deepStrictEqual(patched, ["repos/{owner}/{repo}/pulls/comments/10", "repos/{owner}/{repo}/pulls/comments/20"]);
});

test("旧形式付きの既存コメントに再実行すると新形式 1 行に置き換わる", () => {
  const { gh, calls } = fakeGh({
    comments: [
      { id: 10, body: `1: a\n\n${link("次▶", 20)}` },
      { id: 20, body: `2: b\n\n${link("◀前", 10)}` },
    ],
  });
  run({ pr: "315", reviewId: "77", gh });
  const bodies = patchCalls(calls).map((a) => a[a.indexOf("-f") + 1]);
  assert.deepStrictEqual(bodies, [
    `body=1: a\n\n1 ${link("2", 20)} ${link("▶", 20)}`,
    `body=2: b\n\n${link("◀", 10)} ${link("1", 10)} 2`,
  ]);
});

test("review ID が空文字なら渡されていないものとして扱う", () => {
  const { gh, calls } = fakeGh({
    reviews: [{ id: 5, user: { login: "me" }, submitted_at: "2026-09-29T00:00:00Z" }],
    comments: [{ id: 10, body: "1: a" }, { id: 20, body: "2: b" }],
  });
  run({ pr: "315", reviewId: "", gh });
  assert.ok(calls.some((a) => a.includes("repos/{owner}/{repo}/pulls/315/reviews/5/comments")));
});

test("review ID が無ければ、実行者自身の最も新しい review を選ぶ", () => {
  const { gh, calls } = fakeGh({
    reviews: [
      { id: 5, user: { login: "me" }, submitted_at: "2026-09-29T00:00:00Z" },
      { id: 6, user: { login: "other" }, submitted_at: "2026-09-29T02:00:00Z" },
      { id: 7, user: { login: "me" }, submitted_at: "2026-09-29T01:00:00Z" },
    ],
    comments: [{ id: 10, body: "1: a" }, { id: 20, body: "2: b" }],
  });
  run({ pr: "315", gh });
  assert.ok(calls.some((a) => a.includes("repos/{owner}/{repo}/pulls/315/reviews/7/comments")));
});

test("実行者の review が無ければ ok: false で理由を返し、編集しない", () => {
  const { gh, calls } = fakeGh({ reviews: [{ id: 6, user: { login: "other" }, submitted_at: "x" }] });
  const r = run({ pr: "315", gh });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /review/);
  assert.strictEqual(patchCalls(calls).length, 0);
});

test("番号コメントが 1 件なら編集せず、全件 0 で ok: true", () => {
  const { gh, calls } = fakeGh({ comments: [{ id: 10, body: "1: 一番" }, { id: 11, body: "意図" }] });
  const r = run({ pr: "315", reviewId: "77", gh });
  assert.deepStrictEqual(
    { ok: r.ok, total: r.total, linked: r.linked, failed: r.failed },
    { ok: true, total: 0, linked: 0, failed: 0 },
  );
  assert.strictEqual(patchCalls(calls).length, 0);
});

test("一部の編集が失敗しても残りは続け、失敗件数と理由を返す", () => {
  const { gh, calls } = fakeGh({
    comments: [{ id: 10, body: "1: a" }, { id: 20, body: "2: b" }, { id: 30, body: "3: c" }],
    failPatch: [20],
  });
  const r = run({ pr: "315", reviewId: "77", gh });
  assert.strictEqual(patchCalls(calls).length, 3);
  assert.deepStrictEqual(
    { ok: r.ok, total: r.total, linked: r.linked, failed: r.failed },
    { ok: true, total: 3, linked: 2, failed: 1 },
  );
  assert.deepStrictEqual(r.failures, [{ id: 20, reason: "HTTP 404" }]);
});

test("一覧の取得が失敗したら throw せず ok: false で理由を返す", () => {
  const { gh } = fakeGh({ failList: true });
  const r = run({ pr: "315", reviewId: "77", gh });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /HTTP 500/);
});

test("PR 番号が数字でなければ gh を呼ばずに ok: false", () => {
  const { gh, calls } = fakeGh();
  const r = run({ pr: "--help", reviewId: "77", gh });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(calls.length, 0);
});

test("gh が無い環境でも CLI は終了コード 0 で ok: false を書く", () => {
  const dir = mkdtempSync(join(tmpdir(), "nav-links-"));
  const out = join(dir, "nav-links.json");
  execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--review", "77", "--out", out], {
    env: { PATH: "" },
    encoding: "utf8",
  });
  const r = JSON.parse(readFileSync(out, "utf8"));
  assert.strictEqual(r.ok, false);
});

test("引数が足りないときだけ CLI は終了コード 1", () => {
  assert.throws(() => execFileSync(process.execPath, [CLI_PATH, "--pr", "315"], { stdio: "pipe" }));
});

test("自分の PENDING review は submitted_at が無いので選ばず、提出済みの review を選ぶ", () => {
  const { gh, calls } = fakeGh({
    reviews: [
      { id: 8, user: { login: "me" }, state: "PENDING" },
      { id: 7, user: { login: "me" }, state: "COMMENTED", submitted_at: "2026-09-29T01:00:00Z" },
    ],
    comments: [{ id: 10, body: "1: a" }, { id: 20, body: "2: b" }],
  });
  run({ pr: "315", gh });
  assert.ok(calls.some((a) => a.includes("repos/{owner}/{repo}/pulls/315/reviews/7/comments")));
  assert.ok(!calls.some((a) => a.includes("reviews/8/comments")));
});

test("planEdits を自分の出力に再適用しても本文は変わらない", () => {
  const input = [
    { id: 10, body: "1: a" },
    { id: 20, body: "2: b\n\n本文の途中の [▶](x) は残す" },
    { id: 30, body: "3: c" },
  ];
  const once = planEdits({ owner: "o", repo: "r", pr: "1", comments: input });
  const twice = planEdits({ owner: "o", repo: "r", pr: "1", comments: once });
  assert.deepStrictEqual(twice, once);
  assert.strictEqual(once[1].body.split("\n\n")[1], "本文の途中の [▶](x) は残す".split("\n\n")[0]);
});

test("想定外の例外でも CLI は終了コード 0 で ok: false の JSON を書く", () => {
  const dir = mkdtempSync(join(tmpdir(), "nav-links-"));
  const bin = join(dir, "gh");
  writeFileSync(
    bin,
    `#!/bin/sh
case "$*" in
  *reviews/*/comments*) echo '[[null]]' ;;
  *) echo '{"owner":"o","repo":"r"}' ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  const out = join(dir, "nav-links.json");
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--review", "77", "--out", out], {
    env: { PATH: dir },
    encoding: "utf8",
  });
  const r = JSON.parse(readFileSync(out, "utf8"));
  assert.strictEqual(r.ok, false);
  assert.ok(typeof r.reason === "string" && r.reason !== "");
  assert.strictEqual(JSON.parse(stdout).ok, false);
});

test("印付きの番号コメントにリンク行を足しても、印は残り、再適用しても 1 つのまま", () => {
  const input = [
    { id: 10, body: `1: a\n\n${COMMENT_MARKER}` },
    { id: 20, body: `2: b\n\n${COMMENT_MARKER}` },
  ];
  const once = planEdits({ ...REPO, comments: input });
  const twice = planEdits({ ...REPO, comments: once });
  for (const e of [...once, ...twice]) {
    assert.strictEqual(e.body.split(COMMENT_MARKER).length, 2);
    assert.ok(e.body.indexOf(COMMENT_MARKER) < e.body.indexOf("](https://github.com/"));
  }
  assert.deepStrictEqual(twice, once);
});
