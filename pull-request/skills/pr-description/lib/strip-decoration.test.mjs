import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { maskProtected, stripDecoration, stripAll } from "./strip-decoration.mjs";

// cwd 相対だと実行ディレクトリに依存して壊れるので、このテストファイル自身の
// 場所から解決する（どのディレクトリから node --test を叩いても通るように）。
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "strip-decoration.mjs");

const POLICY = { "絵文字を全面禁止": true, "太字を全面禁止": true };

test("絵文字を消す", () => {
  const r = stripDecoration("やりました🎉", POLICY);
  assert.strictEqual(r.text, "やりました");
  assert.strictEqual(r.emoji, 1);
  assert.strictEqual(r.bold, 0);
});

test("絵文字を消した行末の空白を残さない", () => {
  const r = stripDecoration("直した 🎉\n次の行", POLICY);
  assert.strictEqual(r.text, "直した\n次の行");
});

test("星 2 つの太字は記号だけ外す", () => {
  const r = stripDecoration("これは**重要**です", POLICY);
  assert.strictEqual(r.text, "これは重要です");
  assert.strictEqual(r.bold, 1);
});

test("下線 2 つの太字も記号だけ外す", () => {
  const r = stripDecoration("これは__重要__です", POLICY);
  assert.strictEqual(r.text, "これは重要です");
  assert.strictEqual(r.bold, 1);
});

test("太字が複数あれば個数を数える", () => {
  const r = stripDecoration("**A** と **B**", POLICY);
  assert.strictEqual(r.text, "A と B");
  assert.strictEqual(r.bold, 2);
});

// バッククォート 3 連を文字列に直書きすると Markdown のコードブロックが閉じるので組み立てる
const FENCE = "`".repeat(3);

test("コードフェンスの中は変換しない", () => {
  const src = `外の**太字**\n\n${FENCE}js\nconst a = 1; // **これは残す** 🎉\n${FENCE}\n`;
  const r = stripDecoration(src, POLICY);
  assert.ok(r.text.includes("**これは残す**"));
  assert.ok(r.text.includes("🎉"));
  assert.ok(r.text.includes("外の太字"));
  assert.strictEqual(r.bold, 1);
  assert.strictEqual(r.emoji, 0);
});

test("波ダッシュのコードフェンスも保護する", () => {
  const r = stripDecoration("~~~\n**残す**\n~~~\n", POLICY);
  assert.ok(r.text.includes("**残す**"));
  assert.strictEqual(r.bold, 0);
});

test("インラインコードの中は変換しない", () => {
  const r = stripDecoration("`__tests__` は変えない", POLICY);
  assert.strictEqual(r.text, "`__tests__` は変えない");
  assert.strictEqual(r.bold, 0);
});

test("URL の中の下線は太字として書き換えない", () => {
  const r = stripDecoration("詳細は https://example.com/docs/__init__/page を見る", POLICY);
  assert.strictEqual(r.text, "詳細は https://example.com/docs/__init__/page を見る");
  assert.strictEqual(r.bold, 0);
});

test("素の散文の下線はこれまで通り太字として消える", () => {
  const r = stripDecoration("変数 __init__ を使う", POLICY);
  assert.strictEqual(r.text, "変数 init を使う");
  assert.strictEqual(r.bold, 1);
});

// URL に終端が無いと、URL の直後に続く装飾まで丸ごと保護範囲に飲み込んでしまい、
// 消えず・検出もされない違反として本文に残り続ける（レビュワーの再現ケース）。
test("URL の直後の太字は句点を挟んでも太字として消える", () => {
  const r = stripDecoration("参照 https://example.com/a。**重要**な点がある", POLICY);
  assert.strictEqual(r.text, "参照 https://example.com/a。重要な点がある");
  assert.strictEqual(r.bold, 1);
});

test("URL の直後の絵文字は空白を挟まなくても消える", () => {
  const r = stripDecoration("詳細は https://example.com/a🎉", POLICY);
  assert.strictEqual(r.text, "詳細は https://example.com/a");
  assert.strictEqual(r.emoji, 1);
});

test("装飾が無ければ 0 件で本文も変わらない", () => {
  const src = "採点できなかった候補に仮の点をつけるのをやめた。";
  const r = stripDecoration(src, POLICY);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.emoji, 0);
  assert.strictEqual(r.bold, 0);
});

test("方針で切っていれば消さない", () => {
  const r = stripDecoration("**重要**🎉", { "絵文字を全面禁止": false, "太字を全面禁止": false });
  assert.strictEqual(r.text, "**重要**🎉");
  assert.strictEqual(r.emoji, 0);
  assert.strictEqual(r.bold, 0);
});

test("maskProtected は文字位置を保つ", () => {
  const src = "a`b`c";
  const masked = maskProtected(src);
  assert.strictEqual(masked.length, src.length);
  assert.strictEqual(masked, "a   c");
});

test("stripAll は本文・行コメント・タイトルを回して個数を合算する", () => {
  const r = stripAll(
    {
      body: "本文**太字**",
      lineComments: [{ path: "a.mjs", line: 1, numbered: true, text: "1: 直した🎉" }],
      title: "**タイトル**",
    },
    POLICY,
  );
  assert.strictEqual(r.body, "本文太字");
  assert.strictEqual(r.lineComments[0].text, "1: 直した");
  assert.strictEqual(r.lineComments[0].path, "a.mjs");
  assert.strictEqual(r.lineComments[0].numbered, true);
  assert.strictEqual(r.title, "タイトル");
  assert.deepStrictEqual(r.counts, { emoji: 1, bold: 2 });
});

test("stripAll はタイトル無しでも動く", () => {
  const r = stripAll({ body: "本文", lineComments: [] }, POLICY);
  assert.strictEqual(r.title, undefined);
  assert.deepStrictEqual(r.counts, { emoji: 0, bold: 0 });
});

test("絵文字が無い区間の行末空白は残す", () => {
  const input = "note 🎉\n\n" + FENCE + "js\ncode\n" + FENCE + "\nafter  \nend2";
  const r = stripDecoration(input, POLICY);
  // 絵文字は最初の区間にあったが、"after  " の行末スペースは別の区間なので残すべき
  assert.strictEqual(r.text.includes("after  "), true);
  assert.strictEqual(r.emoji, 1);
});

test("CLI はファイルをその場で書き換えて個数を出す", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "strip-decoration-test-"));
  try {
    const bodyFile = join(tmpDir, "body.md");
    const commentsFile = join(tmpDir, "comments.json");
    const titleFile = join(tmpDir, "title.txt");
    const policyFile = join(tmpDir, "policy.json");

    // テストファイルを作成
    writeFileSync(bodyFile, "本文**太字**\n");
    writeFileSync(commentsFile, JSON.stringify([{ path: "a.mjs", text: "直した🎉" }], null, 2) + "\n");
    writeFileSync(titleFile, "**タイトル**");
    writeFileSync(policyFile, JSON.stringify({ "絵文字を全面禁止": true, "太字を全面禁止": true }));

    // CLI を実行
    const output = execFileSync(process.execPath, [
      CLI_PATH,
      "--body-file", bodyFile,
      "--comments-file", commentsFile,
      "--title-file", titleFile,
      "--policy", policyFile,
    ], { encoding: "utf8" });

    // 出力されたカウントを検証
    const result = JSON.parse(output);
    assert.strictEqual(result.emoji, 1);
    assert.strictEqual(result.bold, 2);

    // ファイルが書き換わっていることを検証
    const newBody = readFileSync(bodyFile, "utf8");
    assert.strictEqual(newBody, "本文太字\n");

    const newComments = JSON.parse(readFileSync(commentsFile, "utf8"));
    assert.strictEqual(newComments[0].text, "直した");
    assert.strictEqual(newComments[0].path, "a.mjs");

    const newTitle = readFileSync(titleFile, "utf8");
    assert.strictEqual(newTitle, "タイトル");
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
