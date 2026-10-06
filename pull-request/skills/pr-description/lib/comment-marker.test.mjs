import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMENT_MARKER, stampComments, buildReviewBody } from "./comment-marker.mjs";

const CLI_PATH = fileURLToPath(new URL("./comment-marker.mjs", import.meta.url));
const M = "<!-- pr-desc:comment -->";

const c = (path, line, numbered, text) => ({ path, line, numbered, text });

// --- stampComments ---

test("番号コメントに印が付く", () => {
  assert.deepStrictEqual(stampComments([c("a.ts", 3, true, "1: 先に読む")]), [
    { path: "a.ts", line: 3, body: `1: 先に読む\n\n${M}` },
  ]);
});

test("意図コメントにも印が付く", () => {
  assert.deepStrictEqual(stampComments([c("a.ts", 5, false, "ここは意図的に残す")]), [
    { path: "a.ts", line: 5, body: `ここは意図的に残す\n\n${M}` },
  ]);
});

test("本文の末尾に改行が複数あっても、本文と印の間は空行 1 つだけになる", () => {
  assert.strictEqual(stampComments([c("a.ts", 1, false, "本文\n\n\n")])[0].body, `本文\n\n${M}`);
});

test("本文の末尾の空白と改行が混ざっていても落とされる", () => {
  assert.strictEqual(stampComments([c("a.ts", 1, false, "本文  \n \t\n")])[0].body, `本文\n\n${M}`);
});

test("本文の先頭と途中の空白や改行は変えない", () => {
  assert.strictEqual(
    stampComments([c("a.ts", 1, false, "  先頭空白\n\n途中の空行\n末尾")])[0].body,
    `  先頭空白\n\n途中の空行\n末尾\n\n${M}`,
  );
});

test("path と line がそのまま渡る", () => {
  const r = stampComments([c("src/dir/b.mjs", 42, true, "2: x")]);
  assert.strictEqual(r[0].path, "src/dir/b.mjs");
  assert.strictEqual(r[0].line, 42);
  assert.strictEqual(typeof r[0].line, "number");
});

test("numbered は出力に入らない", () => {
  const r = stampComments([c("a.ts", 1, true, "1: x"), c("a.ts", 2, false, "y")]);
  for (const e of r) assert.deepStrictEqual(Object.keys(e).sort(), ["body", "line", "path"]);
});

test("入力の件数と順序を保つ", () => {
  const r = stampComments([c("a.ts", 9, false, "c"), c("b.ts", 1, true, "1: a"), c("a.ts", 2, true, "2: b")]);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map((e) => `${e.path}:${e.line}`), ["a.ts:9", "b.ts:1", "a.ts:2"]);
});

test("入力の配列と要素を書き換えない", () => {
  const input = [c("a.ts", 1, false, "本文\n\n")];
  const copy = structuredClone(input);
  stampComments(input);
  assert.deepStrictEqual(input, copy);
  assert.strictEqual(input[0].text, "本文\n\n");
  assert.ok(!("body" in input[0]));
});

test("stampComments は空配列なら空配列を返す", () => {
  assert.deepStrictEqual(stampComments([]), []);
});

test("印は定数 COMMENT_MARKER と同じ文字列で、各 body はそれで終わる", () => {
  assert.strictEqual(COMMENT_MARKER, M);
  for (const e of stampComments([c("a.ts", 1, true, "1: a"), c("a.ts", 2, false, "b")])) {
    assert.ok(e.body.endsWith(COMMENT_MARKER));
  }
});

test("本文に日本語や記号があってもそのまま保たれる", () => {
  assert.strictEqual(
    stampComments([c("a.ts", 1, false, "`code` と <b>タグ</b> と 日本語")])[0].body,
    `\`code\` と <b>タグ</b> と 日本語\n\n${M}`,
  );
});

// --- buildReviewBody ---

test("番号コメント 3 件・意図コメント 2 件なら番号順の案内と印", () => {
  const input = [
    c("a.ts", 1, true, "1: a"),
    c("a.ts", 2, false, "i1"),
    c("a.ts", 3, true, "2: b"),
    c("b.ts", 1, false, "i2"),
    c("b.ts", 2, true, "3: c"),
  ];
  assert.strictEqual(buildReviewBody(input), `1 から 3 の番号順に読んでください。\n\n${M}`);
});

test("番号コメントが 1 件でも 1 から 1 と書く", () => {
  assert.strictEqual(buildReviewBody([c("a.ts", 1, true, "1: a")]), `1 から 1 の番号順に読んでください。\n\n${M}`);
});

test("番号コメント 0 件（意図コメントだけ）なら印だけ", () => {
  assert.strictEqual(buildReviewBody([c("a.ts", 1, false, "i1"), c("a.ts", 2, false, "i2")]), M);
});

test("コメントが 0 件（空配列）でも印だけ", () => {
  assert.strictEqual(buildReviewBody([]), M);
});

test("番号の件数は numbered フラグの true の件数で数える", () => {
  assert.strictEqual(
    buildReviewBody([c("a.ts", 1, true, "1: a"), c("a.ts", 2, true, "2: b")]),
    `1 から 2 の番号順に読んでください。\n\n${M}`,
  );
});

test("番号の件数が 2 桁でも数える", () => {
  const input = Array.from({ length: 12 }, (_, i) => c("a.ts", i + 1, true, `${i + 1}: x`));
  assert.strictEqual(buildReviewBody(input), `1 から 12 の番号順に読んでください。\n\n${M}`);
});

test("numbered が false なら text が 1: で始まっても数えない", () => {
  assert.strictEqual(buildReviewBody([c("a.ts", 1, false, "1: x")]), M);
});

test("buildReviewBody は入力の配列を書き換えない", () => {
  const input = [c("a.ts", 1, true, "1: a"), c("a.ts", 2, true, "2: b")];
  const copy = structuredClone(input);
  buildReviewBody(input);
  assert.deepStrictEqual(input, copy);
});

test("返り値の末尾は印で、印が 1 回だけ現れる", () => {
  const r = buildReviewBody([c("a.ts", 1, true, "1: a"), c("a.ts", 2, true, "2: b")]);
  assert.ok(r.endsWith(M));
  assert.strictEqual(r.split(M).length - 1, 1);
});

// --- CLI ---

const setup = () => mkdtempSync(join(tmpdir(), "comment-marker-"));
const runCli = (args) => spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });

test("CLI: --in と --out を渡すと出力ファイルに review_body と comments を書く", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  const out = join(dir, "post.json");
  writeFileSync(inp, JSON.stringify([c("a.ts", 1, true, "1: a\n"), c("a.ts", 2, false, "i")]));
  const r = runCli(["--in", inp, "--out", out]);
  assert.strictEqual(r.status, 0);
  const got = JSON.parse(readFileSync(out, "utf8"));
  assert.deepStrictEqual(got, {
    review_body: `1 から 1 の番号順に読んでください。\n\n${M}`,
    comments: [
      { path: "a.ts", line: 1, body: `1: a\n\n${M}` },
      { path: "a.ts", line: 2, body: `i\n\n${M}` },
    ],
  });
  assert.deepStrictEqual(Object.keys(got).sort(), ["comments", "review_body"]);
});

test("CLI: 番号コメントが 0 件の入力では review_body が印だけになる", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  const out = join(dir, "post.json");
  writeFileSync(inp, JSON.stringify([c("a.ts", 2, false, "i")]));
  assert.strictEqual(runCli(["--in", inp, "--out", out]).status, 0);
  const got = JSON.parse(readFileSync(out, "utf8"));
  assert.strictEqual(got.review_body, M);
  assert.strictEqual(got.comments.length, 1);
});

test("CLI: 入力が空配列でも成功し、comments は空配列", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  const out = join(dir, "post.json");
  writeFileSync(inp, "[]");
  assert.strictEqual(runCli(["--in", inp, "--out", out]).status, 0);
  assert.deepStrictEqual(JSON.parse(readFileSync(out, "utf8")), { review_body: M, comments: [] });
});

test("CLI: 入力の line-comments.json 自体を書き換えない", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  writeFileSync(inp, JSON.stringify([c("a.ts", 1, true, "1: a\n")]));
  const before = readFileSync(inp);
  runCli(["--in", inp, "--out", join(dir, "post.json")]);
  assert.ok(readFileSync(inp).equals(before));
});

test("CLI: 引数が何もないとき終了コード 1 で標準エラーに理由を出す", () => {
  const r = runCli([]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
});

test("CLI: --out がないとき終了コード 1", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  writeFileSync(inp, "[]");
  const r = runCli(["--in", inp]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
});

test("CLI: --in がないとき終了コード 1", () => {
  const out = join(setup(), "post.json");
  const r = runCli(["--out", out]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
  assert.ok(!existsSync(out));
});

test("CLI: 入力が JSON の配列でないとき終了コード 1", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  const out = join(dir, "post.json");
  writeFileSync(inp, JSON.stringify({ path: "a.ts", line: 1 }));
  const r = runCli(["--in", inp, "--out", out]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
  assert.ok(!existsSync(out));
});

test("CLI: 入力が JSON として壊れているとき終了コード 1", () => {
  const dir = setup();
  const inp = join(dir, "line-comments.json");
  const out = join(dir, "post.json");
  writeFileSync(inp, "[{");
  const r = runCli(["--in", inp, "--out", out]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
  assert.ok(!existsSync(out));
});

test("CLI: 入力ファイルが存在しないとき終了コード 1", () => {
  const dir = setup();
  const out = join(dir, "post.json");
  const r = runCli(["--in", join(dir, "nothing.json"), "--out", out]);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr.trim(), "");
  assert.ok(!existsSync(out));
});
