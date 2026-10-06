import { test } from "node:test";
import assert from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  loadPolicy,
  extractOpenPart,
  countSentences,
  checkStructure,
  checkVocabulary,
  checkBannedExpressions,
  checkDetails,
  checkLineComments,
  checkAll,
  stripNoise,
  extractIdentifiers,
  collectIdentifiers,
  extractParens,
  collectParens,
  checkBodySections,
  checkTitle,
  checkGeneratedFileComments,
} from "./slop-check.mjs";
import { classifyRule, RULE_KINDS } from "./slop-check.mjs";

const POLICY = loadPolicy(join(dirname(fileURLToPath(import.meta.url)), "..", "policy", "slop.json"));

test("extractOpenPart は details とコメントを落とす", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>なぜこうしたか</summary>",
    "経緯をここに書く。",
    "</details>",
    "",
    "<!-- pr-desc: sha=aaaaaa -->",
  ].join("\n");
  assert.strictEqual(extractOpenPart(body).trim(), "主眼の文。");
});

test("countSentences は句点で数える", () => {
  assert.strictEqual(countSentences("一つ目。二つ目。"), 2);
  assert.strictEqual(countSentences("句点なし"), 1);
  assert.strictEqual(countSentences(""), 0);
});

test("展開部分が 3 文あると違反になる", () => {
  const v = checkStructure("一。二。三。", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分の最大文数"));
});

test("展開部分が 2 文なら違反にならない", () => {
  assert.deepStrictEqual(checkStructure("一。二。", POLICY), []);
});

test("展開部分の箇条書きは違反になる", () => {
  const v = checkStructure("主眼。\n\n- 変更点\n- 変更点\n", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分に箇条書きを禁止"));
});

test("番号付き箇条書きも違反になる", () => {
  const v = checkStructure("主眼。\n\n1. 変更点\n", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分に箇条書きを禁止"));
});

test("展開部分のファイル名は違反になる", () => {
  const v = checkStructure("lib/score.mjs を直した。", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分にファイル名を禁止"));
});

test("details の中のファイル名と箇条書きは違反にならない", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>テスト</summary>",
    "- lib/score.mjs にテストを足した。ほかのスキルの挙動は変えていない。",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(checkStructure(body, POLICY), []);
});

test("入れ子 details で中身が展開部分に漏れないこと", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>外側</summary>",
    "<details>",
    "<summary>内側</summary>",
    "- 変更点",
    "lib/nested.mjs を直した。",
    "</details>",
    "</details>",
  ].join("\n");
  // 入れ子の中身はすべて取り除かれるので、違反がないはず
  assert.deepStrictEqual(checkStructure(body, POLICY), []);
});

test("・中黒の箇条書きは違反になる", () => {
  const v = checkStructure("主眼。\n\n・ 変更点\n・ 変更点\n", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分に箇条書きを禁止"));
});

test("+ プラス記号の箇条書きは違反になる", () => {
  const v = checkStructure("主眼。\n\n+ 変更点\n+ 変更点\n", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分に箇条書きを禁止"));
});

test("バージョン番号 1.2.3 は箇条書き違反にならない", () => {
  const v = checkStructure("1.2.3 に上げた。", POLICY);
  assert.deepStrictEqual(v, []);
});

test("Component.jsx でファイル名違反が出る", () => {
  const v = checkStructure("Component.jsx を直した。", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分にファイル名を禁止"));
});

test("style.css でファイル名違反が出る", () => {
  const v = checkStructure("style.css を直した。", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分にファイル名を禁止"));
});

test("一。二？三！ が 3 文と数えられること", () => {
  assert.strictEqual(countSentences("一。二？三！"), 3);
});

test("禁止語を検出する", () => {
  const v = checkVocabulary("大幅に改善しました。", POLICY);
  assert.ok(v.some((x) => x.rule === "禁止語" && x.detail.includes("大幅に")));
  assert.ok(v.some((x) => x.rule === "禁止語" && x.detail.includes("改善しました")));
});

test("禁止語が無ければ違反にならない", () => {
  assert.deepStrictEqual(checkVocabulary("採点失敗時の 50 埋めをやめた。", POLICY), []);
});

test("新しく足した禁止語を検出する", () => {
  const v = checkVocabulary("これは不可欠な対応であり、多角的に掘り下げる。", POLICY);
  for (const word of ["不可欠", "多角的", "掘り下げる"]) {
    assert.ok(
      v.some((x) => x.rule === "禁止語" && x.detail.includes(word)),
      `${word} が検出されていない`,
    );
  }
});

test("新しいカテゴリ名が detail に出る", () => {
  const v = checkVocabulary("事象を深掘りする。", POLICY);
  const hit = v.find((x) => x.rule === "禁止語");
  assert.ok(hit, "深掘りする が検出されていない");
  assert.ok(hit.detail.startsWith("空虚な動詞:"), `カテゴリ名が違う: ${hit.detail}`);
});

test("絵文字を検出する", () => {
  const v = checkVocabulary("直した🎉", POLICY);
  assert.ok(v.some((x) => x.rule === "絵文字を全面禁止"));
  assert.ok(!v.some((x) => x.rule === "禁止語"));
});

test("details の中身が短いと空虚なテンプレ節として違反になる", () => {
  const body = ["主眼。", "<details>", "<summary>テスト</summary>", "特にありません。", "</details>"].join("\n");
  const v = checkDetails(body, POLICY);
  assert.ok(v.some((x) => x.rule === "detailsの中身の最小文字数"));
});

test("details の中身が十分あれば違反にならない", () => {
  const body = [
    "主眼。",
    "<details>",
    "<summary>テスト</summary>",
    "score.test.mjs に 2 件足した。リトライ上限で throw することを確かめている。",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(checkDetails(body, POLICY), []);
});

test("番号コメントに改行があると違反になる", () => {
  const v = checkLineComments(["1: 採点失敗時の経路", "2: 一行目\n二行目"], POLICY);
  assert.ok(v.some((x) => x.rule === "番号コメントは1行"));
});

test("番号なしの意図コメントは複数行でも違反にならない", () => {
  const v = checkLineComments(["applyFallback を消していないのは、\n他のスキルが依存しているため。"], POLICY);
  assert.deepStrictEqual(v, []);
});

test("checkAll は全ルールの違反を集める", () => {
  const body = ["一。二。三。", "<details>", "<summary>x</summary>", "短い。", "</details>"].join("\n");
  const { violations } = checkAll({ body, lineComments: ["1: 一行目\n二行目"] }, POLICY);
  const rules = violations.map((v) => v.rule);
  assert.ok(rules.includes("展開部分の最大文数"));
  assert.ok(rules.includes("detailsの中身の最小文字数"));
  assert.ok(rules.includes("番号コメントは1行"));
});

test("きれいな入力では violations が空になる", () => {
  const body = [
    "採点に失敗した候補を 50 で埋めるのをやめた。",
    "",
    summaryBlock(),
  ].join("\n");
  const { violations } = checkAll({ body, lineComments: ["1: 50 埋めの入口"] }, POLICY);
  assert.deepStrictEqual(violations, []);
});

test("改行で区切られた体言止めの羅列を 1 文と数えない", () => {
  assert.strictEqual(
    countSentences("採点の 50 埋めをやめた\nリトライ 3 回で停止する\nテストを 2 件足した\n"),
    3
  );
});

test("改行区切りの多文は展開部分の最大文数の違反になる", () => {
  const v = checkStructure("採点の 50 埋めをやめた\nリトライ 3 回で停止する\nテストを 2 件足した\n", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分の最大文数"));
});

test("句点で終わる 1 文が改行で終わっていても 1 文のまま", () => {
  assert.strictEqual(countSentences("採点の 50 埋めをやめた。\n"), 1);
});

test("入れ子 details の内側が短いと違反になる", () => {
  const body = [
    "主眼。",
    "<details>",
    "<summary>外側</summary>",
    "外側にはリトライ上限で停止するようにした経緯を書いている。理由は次のとおり。",
    "<details>",
    "<summary>内側</summary>",
    "特にありません。",
    "</details>",
    "</details>",
  ].join("\n");
  const v = checkDetails(body, POLICY);
  assert.ok(v.some((x) => x.rule === "detailsの中身の最小文字数"));
});

test("入れ子 details の内側が十分あれば違反にならない", () => {
  const body = [
    "主眼。",
    "<details>",
    "<summary>外側</summary>",
    "<details>",
    "<summary>内側</summary>",
    "score.test.mjs に 2 件足した。リトライ上限で throw することを確かめている。",
    "</details>",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(checkDetails(body, POLICY), []);
});

test("line-comments.json のオブジェクト配列をそのまま検査できる", () => {
  const comments = [
    { path: "lib/score.mjs", line: 42, numbered: true, text: "1: 採点失敗時の経路" },
    { path: "lib/score.mjs", line: 61, numbered: true, text: "2: 一行目\n二行目" },
  ];
  const v = checkLineComments(comments, POLICY);
  assert.ok(v.some((x) => x.rule === "番号コメントは1行"));
  assert.strictEqual(v.length, 1);
});

test("numbered: false の意図コメントは複数行でも違反にならない", () => {
  const comments = [
    {
      path: "lib/score.mjs",
      line: 42,
      numbered: false,
      text: "applyFallback を消していないのは、\n他のスキルが依存しているため。",
    },
  ];
  assert.deepStrictEqual(checkLineComments(comments, POLICY), []);
});

test("1. 形式の番号コメントも numbered フラグで違反になる", () => {
  const comments = [{ path: "a.mjs", line: 1, numbered: true, text: "1. 一行目\n二行目" }];
  const v = checkLineComments(comments, POLICY);
  assert.ok(v.some((x) => x.rule === "番号コメントは1行"));
});

test("checkAll はオブジェクトの行コメントにも禁止語検査をかける", () => {
  const comments = [{ path: "a.mjs", line: 1, numbered: true, text: "1: 大幅に速くした" }];
  const { violations } = checkAll({ body: "主眼。", lineComments: comments }, POLICY);
  assert.ok(violations.some((x) => x.rule === "禁止語" && x.detail.includes("大幅に")));
});

test("checkTitle は禁止語を検出する", async () => {
  const { checkTitle } = await import("./slop-check.mjs");
  const v = checkTitle("大幅に改善しました", POLICY);
  assert.ok(v.some((x) => x.rule === "禁止語"));
});

test("checkTitle は絵文字を検出する", async () => {
  const { checkTitle } = await import("./slop-check.mjs");
  const v = checkTitle("直した🎉", POLICY);
  assert.ok(v.some((x) => x.rule === "絵文字を全面禁止"));
});

test("checkTitle は 35 文字を超えると違反にする", async () => {
  const { checkTitle } = await import("./slop-check.mjs");
  const title = "あ".repeat(36);
  const v = checkTitle(title, POLICY);
  assert.ok(v.some((x) => x.rule === "PRタイトルの最大文字数"));
});

test("checkTitle は 35 文字ちょうどは違反にしない", async () => {
  const { checkTitle } = await import("./slop-check.mjs");
  const title = "あ".repeat(35);
  const v = checkTitle(title, POLICY);
  assert.ok(!v.some((x) => x.rule === "PRタイトルの最大文字数"));
});

test("checkAll は title を渡されたときだけタイトル検査を行う", async () => {
  const { checkAll } = await import("./slop-check.mjs");
  const withTitle = checkAll({ body: "主眼。", lineComments: [], title: "大幅に速くした" }, POLICY);
  assert.ok(withTitle.violations.some((x) => x.rule === "禁止語"));

  const withoutTitle = checkAll({ body: "主眼。", lineComments: [] }, POLICY);
  assert.ok(!withoutTitle.violations.some((x) => x.rule === "PRタイトルの最大文字数"));
});

test("extractIdentifiers は単語の途中に大文字が入る語を拾う", () => {
  assert.deepStrictEqual(extractIdentifiers("applyFallback を消していない。", POLICY), ["applyFallback"]);
});

test("extractIdentifiers は下線でつないだ語を拾う", () => {
  assert.deepStrictEqual(extractIdentifiers("enabled_features を足した。", POLICY), ["enabled_features"]);
});

test("extractIdentifiers は括弧付きの語を拾う", () => {
  assert.ok(extractIdentifiers("partitionByThreshold() を呼ぶ。", POLICY).includes("partitionByThreshold()"));
});

test("extractIdentifiers は点でつないだ語を拾う", () => {
  assert.deepStrictEqual(extractIdentifiers("Vendor.enabled_features を追加。", POLICY), ["Vendor.enabled_features"]);
});

test("extractIdentifiers はバッククォート囲みの中身を拾う", () => {
  assert.deepStrictEqual(extractIdentifiers("`confidence` を 50 で埋める。", POLICY), ["confidence"]);
});

test("extractIdentifiers は日本語だけの文からは何も拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("採点できなかった候補に仮の点をつけるのをやめた。", POLICY), []);
});

test("extractIdentifiers は大文字始まりの英単語 1 語を拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("GitHub の PR に DB の話を書く。", POLICY), []);
});

test("extractIdentifiers は許可語を拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("Node.js と iOS の話。", POLICY), []);
});

test("extractIdentifiers は URL の中を拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("詳細は https://github.com/foo/bar_baz を見る。", POLICY), []);
});

test("extractIdentifiers はコードブロックの中を拾わない", () => {
  const text = ["説明の文。", "", "```", "applyFallback(x)", "```", ""].join("\n");
  assert.deepStrictEqual(extractIdentifiers(text, POLICY), []);
});

test("extractIdentifiers は拡張子付きファイル名を拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("lib/score.mjs を直した。", POLICY), []);
});

test("extractIdentifiers は点でつないだ語の部分だけを重ねて出さない", () => {
  assert.deepStrictEqual(extractIdentifiers("Vendor.enabled_features と enabled_features。", POLICY), [
    "Vendor.enabled_features",
  ]);
});

test("extractIdentifiers は部分文字列が一致するだけの別の識別子を落とさない", () => {
  assert.deepStrictEqual(extractIdentifiers("some_user_service と user_service。", POLICY), [
    "some_user_service",
    "user_service",
  ]);
});

test("展開部分に識別子があると違反になる", () => {
  const v = checkStructure("applyFallback を消していない。", POLICY);
  assert.ok(v.some((x) => x.rule === "展開部分に識別子を禁止"));
});

test("collectIdentifiers は details と行コメントから where 付きで返す", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>概要</summary>",
    "applyFallback は残してある。",
    "</details>",
  ].join("\n");
  const comments = [{ path: "lib/score.mjs", line: 42, numbered: true, text: "1: enabled_features を読む" }];
  assert.deepStrictEqual(collectIdentifiers({ body, lineComments: comments }, POLICY), [
    { where: "details 1", token: "applyFallback" },
    { where: "行コメント 1", token: "enabled_features" },
  ]);
});

test("checkAll の戻り値に identifiers が入る", () => {
  const body = ["主眼の文。", "", "<details>", "<summary>概要</summary>", "applyFallback は残してある。", "</details>"].join("\n");
  const result = checkAll({ body, lineComments: [] }, POLICY);
  assert.ok(Array.isArray(result.violations));
  assert.deepStrictEqual(result.identifiers, [{ where: "details 1", token: "applyFallback" }]);
});

test("summary の中の識別子が一覧に入る", () => {
  const body = [
    "採点できなかった候補に仮の点をつけるのをやめた。",
    "",
    "<details>",
    "<summary>applyFallback を消していない理由</summary>",
    "他のスキルが同じ穴埋め処理を通っているため、消さずに呼び出し側で分岐させた。",
    "</details>",
  ].join("\n");
  const { identifiers } = checkAll({ body, lineComments: [] }, POLICY);
  assert.ok(
    identifiers.some((i) => i.where === "summary 1" && i.token === "applyFallback"),
    `summary の識別子が拾えていない: ${JSON.stringify(identifiers)}`
  );
});

test("展開部分の識別子は違反になり一覧には入らない", () => {
  const body = [
    "applyFallback を消していない。",
    "",
    "<details>",
    "<summary>なぜこうしたか</summary>",
    "他のスキルが同じ穴埋め処理を通っているため、消さずに呼び出し側で分岐させた。",
    "</details>",
  ].join("\n");
  const { violations, identifiers } = checkAll({ body, lineComments: [] }, POLICY);
  assert.ok(violations.some((v) => v.rule === "展開部分に識別子を禁止"));
  assert.ok(
    !identifiers.some((i) => i.token === "applyFallback"),
    `展開部分の識別子が一覧に漏れている: ${JSON.stringify(identifiers)}`
  );
});

test("展開部分に識別子が複数あると detail に全部並ぶ", () => {
  const v = checkStructure("Vendor.enabled_features と applyFallback を直した。", POLICY);
  const hits = v.filter((x) => x.rule === "展開部分に識別子を禁止");
  assert.strictEqual(hits.length, 1);
  assert.ok(hits[0].detail.includes("Vendor.enabled_features"), hits[0].detail);
  assert.ok(hits[0].detail.includes("applyFallback"), hits[0].detail);
});

// ハイフン区切りの名前を機械が拾わないのは意図した空白。5 つの語形はどれも
// 下線・語中の大文字・点・括弧・バッククォートを要求するため、この形は残る。
// この担当は Phase 5 の問い 6（一覧に載らない語も自分で探す）にある。
test("ハイフン区切りの名前は拾わない", () => {
  assert.deepStrictEqual(extractIdentifiers("pr-review と rules-distill の話。", POLICY), []);
});

test("禁止タイトルの details があると違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>影響範囲</summary>",
    "",
    "- 破壊的変更",
    "  - なし。今までの穴埋めは残している",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "禁止detailsタイトル"));
});

test("禁止タイトルを含む合成タイトルも違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>テストと影響範囲</summary>",
    "",
    "リトライ上限で止まることを確かめている。",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "禁止detailsタイトル"));
});

test("中身に禁止語があってもタイトルでなければ違反にならない", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>採点の止め方</summary>",
    "",
    "影響範囲を広げないために、採点の経路だけを直した。",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "禁止detailsタイトル"));
});

test("禁止タイトルが無ければ違反にならない", () => {
  const body = ["主眼の文。", "", summaryBlock()].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "禁止detailsタイトル"));
});

test("廃止した影響範囲は任意枠として数える", () => {
  const extra = (title) =>
    ["<details>", `<summary>${title}</summary>`, "", "ここに書いた方がよいと判断した事情を十分な長さで書く。", "", "</details>"].join("\n");
  const body = ["主眼の文。", "", summaryBlock(), extra("事情A"), extra("事情B"), extra("影響範囲")].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "任意枠の最大個数"));
});

function summaryBlock() {
  return [
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- 採点変更",
    "  - 失敗した候補を 50 点で埋めなくした",
    "  - 3 回やり直して駄目なら止める",
    "",
    "</details>",
  ].join("\n");
}

test("変更のサマリーが無いと違反になる", () => {
  const body = ["主眼の文。", "", "<details>", "<summary>概要</summary>", "主眼が三つあるので畳んだ文をここへ書く。", "</details>"].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "必須detailsタイトル"));
});

test("変更のサマリーがあれば必須違反にならない", () => {
  const body = ["主眼の文。", "", summaryBlock()].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "必須detailsタイトル"));
});

function freeBlock(title, inner) {
  return ["<details>", `<summary>${title}</summary>`, "", inner, "", "</details>"].join("\n");
}
function freeBody(...blocks) {
  return ["主眼の文。", "", summaryBlock(), ...blocks].join("\n");
}
const BLOCK_NEWLINE_BYTES = 5;
function sized(bytes, wide = false) {
  const n = bytes - BLOCK_NEWLINE_BYTES;
  return wide ? "あ".repeat(Math.floor(n / 3)) + "a".repeat(n % 3) : "a".repeat(n);
}
const SHORT = "ここに書いた方がよいと判断した事情を十分な長さで書く。";
const rulesOf = (body) => checkBodySections(body, POLICY).map((x) => x.rule);

test("任意枠が 2 個あると個数違反になる", () => {
  assert.ok(rulesOf(freeBody(freeBlock("事情A", SHORT), freeBlock("事情B", SHORT))).includes("任意枠の最大個数"));
});

test("任意枠が 1 個なら個数違反にならない", () => {
  assert.ok(!rulesOf(freeBody(freeBlock("事情A", SHORT))).includes("任意枠の最大個数"));
});

test("任意枠が 0 個でも個数違反にならない", () => {
  assert.ok(!rulesOf(freeBody()).includes("任意枠の最大個数"));
});

test("任意枠が 3 個でも個数違反になる", () => {
  const b = freeBody(freeBlock("事情A", SHORT), freeBlock("事情B", SHORT), freeBlock("事情C", SHORT));
  assert.ok(rulesOf(b).includes("任意枠の最大個数"));
});

test("予約タイトルを足しても任意枠 1 個なら個数違反にならない", () => {
  const b = freeBody(freeBlock("ドキュメント", SHORT), freeBlock("テスト", SHORT), freeBlock("概要", SHORT), freeBlock("事情A", SHORT));
  assert.ok(!rulesOf(b).includes("任意枠の最大個数"));
});

test("予約タイトルを数えず任意枠 2 個だけで個数違反になる", () => {
  const b = freeBody(
    freeBlock("ドキュメント", SHORT), freeBlock("テスト", SHORT), freeBlock("概要", SHORT),
    freeBlock("事情A", SHORT), freeBlock("事情B", SHORT),
  );
  assert.ok(rulesOf(b).includes("任意枠の最大個数"));
});

test("任意枠が 376 バイトだと任意枠のバイト数違反だけが出る", () => {
  const r = rulesOf(freeBody(freeBlock("事情A", sized(376))));
  assert.ok(r.includes("任意枠の最大バイト数"));
  assert.ok(!r.includes("detailsの中身の最大バイト数"));
});

test("任意枠が 375 バイトちょうどなら違反にならない", () => {
  assert.ok(!rulesOf(freeBody(freeBlock("事情A", sized(375)))).includes("任意枠の最大バイト数"));
});

test("任意枠が 374 バイトなら違反にならない", () => {
  assert.ok(!rulesOf(freeBody(freeBlock("事情A", sized(374)))).includes("任意枠の最大バイト数"));
});

test("任意枠のバイト数は UTF-8 で数える（全角まじりで 125 文字でも 376 バイトで超える）", () => {
  assert.ok(rulesOf(freeBody(freeBlock("事情A", sized(376, true)))).includes("任意枠の最大バイト数"));
});

test("任意枠が全角でちょうど 375 バイトなら違反にならない", () => {
  assert.ok(!rulesOf(freeBody(freeBlock("事情A", sized(375, true)))).includes("任意枠の最大バイト数"));
});

test("任意枠が 753 バイトでも任意枠のバイト数違反だけが出る", () => {
  const r = rulesOf(freeBody(freeBlock("事情A", sized(753))));
  assert.ok(r.includes("任意枠の最大バイト数"));
  assert.ok(!r.includes("detailsの中身の最大バイト数"));
});

test("任意枠のバイト数違反の detail は題名・バイト数・上限を含む", () => {
  const v = checkBodySections(freeBody(freeBlock("事情A", sized(376))), POLICY);
  const hit = v.find((x) => x.rule === "任意枠の最大バイト数");
  assert.ok(hit, "任意枠の最大バイト数 の違反が出ていない");
  assert.strictEqual(hit.detail, '"事情A" が 376 バイト。上限は 375 バイト');
});

test("任意枠が 2 個とも長いと、バイト数違反が枠ごとに出て個数違反も出る", () => {
  const v = checkBodySections(freeBody(freeBlock("事情A", sized(376)), freeBlock("事情B", sized(376))), POLICY);
  const hits = v.filter((x) => x.rule === "任意枠の最大バイト数");
  assert.strictEqual(hits.length, 2);
  assert.ok(hits.some((x) => x.detail.includes('"事情A"')));
  assert.ok(hits.some((x) => x.detail.includes('"事情B"')));
  assert.ok(v.some((x) => x.rule === "任意枠の最大個数"));
});

test("変更のサマリーは 376 バイトでも 750 バイトちょうどでも上限違反が出ない", () => {
  for (const n of [376, 750]) {
    const b = ["主眼の文。", "", freeBlock("変更のサマリー", sized(n))].join("\n");
    const r = rulesOf(b);
    assert.ok(!r.includes("任意枠の最大バイト数"), `${n} バイト`);
    assert.ok(!r.includes("detailsの中身の最大バイト数"), `${n} バイト`);
  }
});

test("変更のサマリーが 751 バイトだと共通の上限違反だけが出る", () => {
  const r = rulesOf(["主眼の文。", "", freeBlock("変更のサマリー", sized(751))].join("\n"));
  assert.ok(r.includes("detailsの中身の最大バイト数"));
  assert.ok(!r.includes("任意枠の最大バイト数"));
});

test("テストの枠は 376〜750 バイトでも上限違反が出ない", () => {
  for (const n of [376, 750]) {
    const r = rulesOf(freeBody(freeBlock("テスト", sized(n))));
    assert.ok(!r.includes("任意枠の最大バイト数"), `${n} バイト`);
    assert.ok(!r.includes("detailsの中身の最大バイト数"), `${n} バイト`);
    assert.ok(!r.includes("任意枠の最大個数"), `${n} バイト`);
  }
});

test("テストの枠が 751 バイトだと共通の上限違反だけが出る", () => {
  const r = rulesOf(freeBody(freeBlock("テスト", sized(751))));
  assert.ok(r.includes("detailsの中身の最大バイト数"));
  assert.ok(!r.includes("任意枠の最大バイト数"));
});

test("方針の値は任意枠 1 個・375 バイト", () => {
  assert.strictEqual(POLICY["任意枠の最大個数"], 1);
  assert.strictEqual(POLICY["任意枠の最大バイト数"], 375);
});

test("checkAll を通しても任意枠の 2 つの違反が骨格で出る", () => {
  const body = freeBody(freeBlock("事情A", sized(376)), freeBlock("事情B", SHORT));
  const { violations } = checkAll({ body }, POLICY);
  for (const rule of ["任意枠の最大個数", "任意枠の最大バイト数"]) {
    const hit = violations.find((v) => v.rule === rule);
    assert.ok(hit, `${rule} が出ていない`);
    assert.strictEqual(hit.kind, "骨格");
  }
});

test("予約タイトルは任意枠の個数に数えない", () => {
  const block = (title, inner) =>
    ["<details>", `<summary>${title}</summary>`, "", inner, "", "</details>"].join("\n");
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    block("ドキュメント", "https://github.com/example-org/example-repo/issues/91 を辿る。"),
    block("テスト", ["- テストしたこと", "  - リトライ上限で止まること", "- テストしてないこと", "  - 他スキルからの呼び出し"].join("\n")),
    block("概要", "主眼が三つあるので畳んだ文をここへ書く。"),
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "任意枠の最大個数"));
});

test("1段階目が 21 バイトを超えると違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- あいうえおかきく",
    "  - 失敗した候補を 50 点で埋めなくした",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "1段階目の最大バイト数"));
});

test("1段階目が 21 バイトちょうどなら違反にならない", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- あいうえおかき",
    "  - 失敗した候補を 50 点で埋めなくした",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "1段階目の最大バイト数"));
});

test("除外枠の1段階が21バイト超でも違反にならない", () => {
  const block = (title, inner) =>
    ["<details>", `<summary>${title}</summary>`, "", inner, "", "</details>"].join("\n");
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    block("テスト", ["- テストしたこと", "  - リトライ上限で止まること", "- テストしてないこと", "  - 他スキルからの呼び出し"].join("\n")),
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "1段階目の最大バイト数"));
});

test("1段だけの項目は21バイト超でも違反にならない", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>ドキュメント</summary>",
    "",
    "- https://example.com/this-url-is-far-over-twenty-one-bytes",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "1段階目の最大バイト数"));
});

test("任意枠のネスト見出しが21バイト超なら違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>事情A</summary>",
    "",
    "- あいうえおかきく",
    "  - 失敗した候補を 50 点で埋めなくした",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "1段階目の最大バイト数"));
});

test("4段階目があると違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- 採点変更",
    "  - 失敗した候補を埋めなくした",
    "    - 50 点だった経路を閉じた",
    "      - さらに内側",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "構造化箇条書きの段"));
});

test("1段階目の下に2段階目が無いと違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- 採点変更",
    "- 停止条件",
    "  - 3 回やり直して駄目なら止める",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "1段階目に2段階目が無い"));
});

test("構造化対象に箇条書きが無いと違反になる", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "失敗した候補を 50 点で埋めなくした。3 回やり直して駄目なら止める。",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "構造化箇条書きが無い"));
});

test("タブ1つは2段階目として扱う", () => {
  const body = ["主眼の文。", "", "<details>", "<summary>変更のサマリー</summary>", "", "- 採点変更", "\t- 失敗した候補を 50 点で埋めなくした", "", "</details>"].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "1段階目に2段階目が無い"));
  assert.ok(!v.some((x) => x.rule === "構造化箇条書きの段"));
});

test("変更のサマリーが 750 バイトを超えると違反になる", () => {
  const pad = "あ".repeat(251);
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>変更のサマリー</summary>",
    "",
    "- 採点変更",
    `  - ${pad}`,
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "detailsの中身の最大バイト数"));
});

test("任意枠が 750 バイトを超えると任意枠のバイト数違反になる", () => {
  const pad = "あ".repeat(251);
  const body = ["主眼の文。", "", summaryBlock(), "<details>", "<summary>事情A</summary>", "", pad, "", "</details>"].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "任意枠の最大バイト数"));
  assert.ok(!v.some((x) => x.rule === "detailsの中身の最大バイト数"));
});

test("ドキュメントは 750 バイトを超えても違反にならない", () => {
  const url = `https://example.com/${"a".repeat(800)}`;
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>ドキュメント</summary>",
    "",
    url,
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "detailsの中身の最大バイト数"));
});

test("概要は構造化箇条書きの検査をしない", () => {
  const body = [
    "",
    "<details>",
    "<summary>概要</summary>",
    "",
    "主眼が三つあるのでここに並べた文。これは見出しではない長い文。",
    "",
    "</details>",
    "",
    summaryBlock(),
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(!v.some((x) => x.rule === "1段階目の最大バイト数"));
  assert.ok(!v.some((x) => x.rule === "構造化箇条書きが無い"));
});

// 手順書の出力サンプルが自分のルールを破っていないかを見る。
// 機械が見える回帰だけを止める。ハイフン区切りや大文字始まりの 1 語は
// この検査を通ってしまう（上の「ハイフン区切りの名前は拾わない」を参照）。
test("phase-3.md の出力サンプルが機械検査を通る", () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "references", "phase-3.md");
  const doc = readFileSync(path, "utf8");
  const m = /~~~markdown\n([\s\S]*?)\n~~~/.exec(doc);
  assert.ok(m !== null, "phase-3.md から出力サンプルの本文ブロックを取り出せない");
  const { violations } = checkAll({ body: m[1], lineComments: [] }, POLICY);
  assert.deepStrictEqual(
    violations,
    [],
    `手順書の出力サンプルが自分のルールを破っている: ${JSON.stringify(violations)}`
  );
});

const BOLD_POLICY = { "禁止語": {}, "太字を全面禁止": true, "絵文字を全面禁止": true };

test("太字を検出する", () => {
  const v = checkVocabulary("これは**重要**です", BOLD_POLICY);
  assert.deepStrictEqual(v, [{ rule: "太字を全面禁止", detail: "太字がある" }]);
});

test("下線 2 つの太字も検出する", () => {
  const v = checkVocabulary("これは__重要__です", BOLD_POLICY);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].rule, "太字を全面禁止");
});

test("コードフェンスの中の太字は検出しない", () => {
  const v = checkVocabulary("~~~js\n// **残す**\n~~~\n", BOLD_POLICY);
  assert.deepStrictEqual(v, []);
});

test("インラインコードの中の太字は検出しない", () => {
  const v = checkVocabulary("`__tests__` の話", BOLD_POLICY);
  assert.deepStrictEqual(v, []);
});

test("コードフェンスの中の絵文字は検出しない", () => {
  const v = checkVocabulary("文です\n~~~js\nconst a = \"🎉\";\n~~~\n", BOLD_POLICY);
  assert.deepStrictEqual(v, []);
});

test("インラインコードの中の絵文字は検出しない", () => {
  const v = checkVocabulary("`🎉` の話", BOLD_POLICY);
  assert.deepStrictEqual(v, []);
});

test("散文の絵文字は引き続き検出する", () => {
  const v = checkVocabulary("文です🎉", BOLD_POLICY);
  assert.ok(v.some((x) => x.rule === "絵文字を全面禁止"));
});

test("URL の直後の太字は句点を挟んでも検出する", () => {
  const v = checkVocabulary("参照 https://example.com/a。**重要**な点がある", BOLD_POLICY);
  assert.ok(v.some((x) => x.rule === "太字を全面禁止"));
});

test("URL の直後の絵文字は空白を挟まなくても検出する", () => {
  const v = checkVocabulary("詳細は https://example.com/a🎉", BOLD_POLICY);
  assert.ok(v.some((x) => x.rule === "絵文字を全面禁止"));
});

test("方針で切っていれば太字を検出しない", () => {
  const v = checkVocabulary("**重要**", { "禁止語": {}, "太字を全面禁止": false });
  assert.deepStrictEqual(v, []);
});

test("分類は装飾・骨格・言い換えの 3 つ", () => {
  assert.strictEqual(classifyRule("絵文字を全面禁止"), "装飾");
  assert.strictEqual(classifyRule("太字を全面禁止"), "装飾");
  assert.strictEqual(classifyRule("必須detailsタイトル"), "骨格");
  assert.strictEqual(classifyRule("detailsの中身の最小文字数"), "骨格");
  assert.strictEqual(classifyRule("構造化箇条書きが無い"), "骨格");
  assert.strictEqual(classifyRule("1段階目に2段階目が無い"), "骨格");
  assert.strictEqual(classifyRule("禁止detailsタイトル"), "骨格");
  assert.strictEqual(classifyRule("禁止語"), "言い換え");
  assert.strictEqual(classifyRule("展開部分の最大文数"), "言い換え");
  assert.strictEqual(classifyRule("任意枠の最大個数"), "骨格");
  assert.strictEqual(classifyRule("任意枠の最大バイト数"), "骨格");
  assert.strictEqual(classifyRule("detailsの中身の最大バイト数"), "言い換え");
});

test("分類されていないルールは throw する", () => {
  assert.throws(() => classifyRule("知らないルール"), /分類されていないルール/);
});

// 禁止タイトルは骨格なので、上限まで直しきれなくても投稿ゲートで止まる。
// checkAll は全違反に分類を付けるため、表への登録が漏れると本番の経路が throw で落ちる。
test("禁止タイトルの違反も checkAll を通り、骨格に分類される", () => {
  const body = [
    "主眼の文。",
    "",
    summaryBlock(),
    "<details>",
    "<summary>影響範囲</summary>",
    "",
    "- 破壊的変更",
    "  - なし。今までの穴埋めは残している",
    "",
    "</details>",
  ].join("\n");
  const { violations } = checkAll({ body }, POLICY);
  const hit = violations.find((v) => v.rule === "禁止detailsタイトル");
  assert.ok(hit, "禁止detailsタイトル の違反が出ていない");
  assert.strictEqual(hit.kind, "骨格");
});

test("分類の表に含まれる値は 3 種類だけ", () => {
  const kinds = new Set(Object.values(RULE_KINDS));
  assert.deepStrictEqual([...kinds].sort(), ["装飾", "言い換え", "骨格"].sort());
});

test("checkAll の各違反に分類が付く", () => {
  const policy = {
    "禁止語": { "自己賛美": ["改善しました"] },
    "太字を全面禁止": true,
    "絵文字を全面禁止": true,
    "予約タイトル": ["変更のサマリー"],
    "必須detailsタイトル": ["変更のサマリー"],
    "構造化箇条書きのタイトル": ["変更のサマリー"],
    "detailsの中身の最小文字数": 1,
    "展開部分の最大文数": 2,
  };
  const { violations } = checkAll({ body: "改善しました。\n\n**太字**\n" }, policy);
  assert.ok(violations.length > 0);
  for (const v of violations) {
    assert.ok(["装飾", "骨格", "言い換え"].includes(v.kind), `${v.rule} に分類が無い`);
  }
  assert.strictEqual(violations.find((v) => v.rule === "禁止語").kind, "言い換え");
  assert.strictEqual(violations.find((v) => v.rule === "太字を全面禁止").kind, "装飾");
  assert.strictEqual(violations.find((v) => v.rule === "必須detailsタイトル").kind, "骨格");
});

test("未来の予定を検出する", () => {
  const v = checkBannedExpressions("実機との突き合わせはリリース後の QA で確認する。", POLICY);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].rule, "禁止表現");
  assert.ok(v[0].detail.includes("未来の予定"));
  assert.ok(v[0].detail.includes("リリース後"));
});

test("書き手の評価・提案を検出する", () => {
  const v = checkBannedExpressions("この処理は早めに直すべき。", POLICY);
  assert.strictEqual(v.length, 1);
  assert.ok(v[0].detail.includes("書き手の評価・提案"));
  assert.ok(v[0].detail.includes("すべき"));
});

test("その他の禁止表現を検出する", () => {
  const cases = [
    ["今後この方針で進める。", "今後"],
    ["対応を検討する。", "検討する"],
  ];
  for (const [text, word] of cases) {
    const v = checkBannedExpressions(text, POLICY);
    assert.strictEqual(v.length, 1, text);
    assert.ok(v[0].detail.includes(word), text);
  }
});

test("1 文に複数語があっても違反は 1 件にまとめる", () => {
  const v = checkBannedExpressions("今後は早めに直すべき。", POLICY);
  assert.strictEqual(v.length, 1);
  assert.ok(v[0].detail.includes("今後"));
  assert.ok(v[0].detail.includes("すべき"));
});

test("予定の各形を検出する", () => {
  const cases = [
    ["リリース予定です。", "予定です"],
    ["対応する予定。", "する予定"],
    ["対応予定している。", "予定している"],
    ["対応予定しています。", "予定しています"],
  ];
  for (const [text, word] of cases) {
    const v = checkBannedExpressions(text, POLICY);
    assert.strictEqual(v.length, 1, text);
    assert.ok(v[0].detail.includes(word), text);
  }
});

test("別チケット・追って・申し送りを検出する", () => {
  const cases = [
    ["別チケットで対応する。", "別チケット"],
    ["追って連絡する。", "追って"],
    ["申し送りとする。", "申し送り"],
  ];
  for (const [text, word] of cases) {
    const v = checkBannedExpressions(text, POLICY);
    assert.strictEqual(v.length, 1, text);
    assert.ok(v[0].detail.includes(word), text);
  }
});

test("定型句から外した今後の課題としても禁止表現で拾う", () => {
  const text = "今後の課題として対応する。";
  assert.strictEqual(checkBannedExpressions(text, POLICY).length, 1);
  assert.ok(!checkVocabulary(text, POLICY).some((x) => x.rule === "禁止語"));
});

test("事実の文は違反にならない", () => {
  assert.deepStrictEqual(checkBannedExpressions("実機との突き合わせは行っていない。", POLICY), []);
});

test("現在形の動作説明は違反にならない", () => {
  assert.deepStrictEqual(checkBannedExpressions("3 回まで再試行して超えたら止める。", POLICY), []);
  assert.deepStrictEqual(checkBannedExpressions("値を足していく経路。", POLICY), []);
});

test("業務の名詞は違反にならない", () => {
  assert.deepStrictEqual(checkBannedExpressions("予定数量の集計を変えた。", POLICY), []);
  assert.deepStrictEqual(checkBannedExpressions("返品方針の表示を変えた。", POLICY), []);
});

test("checkAll は行コメントにも禁止表現をかける", () => {
  const { violations } = checkAll(
    { body: "主眼。", lineComments: [{ path: "a.mjs", line: 1, numbered: false, text: "別途対応する。" }] },
    POLICY,
  );
  assert.ok(violations.some((x) => x.rule === "禁止表現"));
});

test("checkTitle は禁止表現を検出する", () => {
  const v = checkTitle("今後も様子を見る", POLICY);
  assert.ok(v.some((x) => x.rule === "禁止表現"));
});

test("禁止表現の違反は骨格に分類される", () => {
  assert.strictEqual(classifyRule("禁止表現"), "骨格");
});

test("禁止タイトルに残課題を検出する", () => {
  const body = [
    "主眼の文。",
    "",
    "<details>",
    "<summary>残課題</summary>",
    "",
    "残っている作業の内容を、読者が分かるように長く書く。",
    "",
    "</details>",
  ].join("\n");
  const v = checkBodySections(body, POLICY);
  assert.ok(v.some((x) => x.rule === "禁止detailsタイトル"));
});

test("extractParens は半角の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("採点できなかった候補に仮の点をつけた(50 点)。"), ["(50 点)"]);
});

test("extractParens は全角の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("採点できなかった候補に仮の点をつけた（50 点）。"), ["（50 点）"]);
});

test("extractParens は全角と半角を出現順に返す", () => {
  assert.deepStrictEqual(extractParens("採点できなかった候補（全体の 1 割）に仮の点(x)をつけた。"), [
    "（全体の 1 割）",
    "(x)",
  ]);
});

test("extractParens は丸括弧が無ければ空配列を返す", () => {
  assert.deepStrictEqual(extractParens("採点できなかった候補に仮の点をつけた。"), []);
});

test("extractParens はコードフェンスの中の丸括弧を拾わない", () => {
  const text = ["採点の式は次のとおり。", "```js", "const score = calc(50);", "```", "以上。"].join("\n");
  assert.deepStrictEqual(extractParens(text), []);
});

test("extractParens はインラインコードの中の丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("採点は `calc(50)` で行った。"), []);
});

test("extractParens は URL の中の丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("詳しくは https://example.com/spec(v2)/detail を参照。"), []);
});

test("extractParens は「」の中の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("「欠測（未回答）は除外した」と説明した。"), ["（未回答）"]);
});

test("extractParens は『』の中の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("『評価不能(判定なし)は対象外』と補足した。"), ["(判定なし)"]);
});

test("extractParens は除外される場所の外の丸括弧を残す", () => {
  assert.deepStrictEqual(extractParens("採点は `calc(50)` で行い、結果（50 点）を記録した。"), ["（50 点）"]);
});

test("extractParens は Markdown リンクの飛び先の丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("[設計メモ](./docs/spec.md) を見よ。"), []);
});

test("extractParens はアンカーの飛び先の丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("詳細は[こちら](#anchor)を見よ。"), []);
});

test("extractParens はリンクと同じ行の本物の丸括弧を残す", () => {
  const text = "[設計メモ](./docs/spec.md) には採点の条件（50 点）が書いてある。";
  assert.deepStrictEqual(extractParens(text), ["（50 点）"]);
});

test("extractParens は丸括弧の中のインラインコードを中身ごと返す", () => {
  const text = "セッションID（`CLAUDE_CODE_SESSION_ID`）を環境変数から取ります。";
  assert.deepStrictEqual(extractParens(text), ["（`CLAUDE_CODE_SESSION_ID`）"]);
});

test("extractParens は丸括弧の中のファイル名を中身ごと返す", () => {
  assert.deepStrictEqual(extractParens("補足は（docs/spec.md）にある。"), ["（docs/spec.md）"]);
  assert.deepStrictEqual(extractParens("補足は(docs/spec.md)にある。"), ["(docs/spec.md)"]);
});

test("extractParens はインラインコードの中だけにある丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("条件は `max_iter(3)` で止める。"), []);
});

test("extractParens は相対パスのリンク先の丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("設計は[仕様書](./docs/design.md)にある。"), []);
});

test("extractParens は URL の中だけにある丸括弧を拾わない", () => {
  assert.deepStrictEqual(extractParens("参照先は https://example.com/guide#a(b) にある。"), []);
});

test("extractParens は URL を囲む全角の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("設計の詳細は（https://example.com/spec）にある。"), [
    "（https://example.com/spec）",
  ]);
});

test("extractParens は URL の直後に続く日本語とその先の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("設計の詳細はhttps://example.com/specにある（重要）。"), ["（重要）"]);
});

test("extractParens は URL の中だけにある丸括弧を拾わないままにする", () => {
  assert.deepStrictEqual(extractParens("URL の中だけ https://example.com/guide#a(b) の丸括弧。"), []);
});

test("extractParens は URL の後ろに空白があっても後ろの丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("設計の詳細は https://example.com/spec にある（重要）。"), ["（重要）"]);
});

test("extractParens は URL の直後の日本語を参照してもその先の丸括弧を拾う", () => {
  assert.deepStrictEqual(extractParens("仕様はhttps://example.com/specを参照（全体像）。"), ["（全体像）"]);
});

test("extractParens は URL の後ろの丸括弧を拾っても Markdown リンクの飛び先は拾わない", () => {
  assert.deepStrictEqual(extractParens("[設計](https://example.com/spec) の詳細（重要）。"), ["（重要）"]);
});

test("展開部分に丸括弧があると違反が 1 件出て detail に全部並ぶ", () => {
  const v = checkStructure(
    "採点できなかった候補に仮の点（50 点）をつけた。その結果(平均以下)になった。",
    { "展開部分に丸括弧を禁止": true },
  );
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].rule, "展開部分に丸括弧を禁止");
  assert.ok(v[0].detail.includes("（50 点）"), v[0].detail);
  assert.ok(v[0].detail.includes("(平均以下)"), v[0].detail);
});

test("展開部分に丸括弧が無ければ違反は出ない", () => {
  const v = checkStructure("採点できなかった候補に仮の点をつけた。", { "展開部分に丸括弧を禁止": true });
  assert.deepStrictEqual(v, []);
});

test("方針のフラグが false のときは展開部分の丸括弧を見ない", () => {
  const v = checkStructure("採点できなかった候補に仮の点（50 点）をつけた。", { "展開部分に丸括弧を禁止": false });
  assert.deepStrictEqual(v, []);
});

test("方針にフラグが無いときは展開部分の丸括弧を見ない", () => {
  assert.deepStrictEqual(checkStructure("採点できなかった候補に仮の点（50 点）をつけた。", {}), []);
});

test("collectParens は展開部分の丸括弧を拾わない", () => {
  assert.deepStrictEqual(collectParens({ body: "採点できなかった候補に仮の点（50 点）をつけた。" }), []);
});

test("collectParens は details の summary から拾う", () => {
  const body = [
    "採点できなかった候補に仮の点をつけた。",
    "",
    "<details>",
    "<summary>補足（50 点）</summary>",
    "",
    "本文はこちら。",
    "",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(collectParens({ body }), [{ where: "summary 1", token: "（50 点）" }]);
});

test("collectParens は details の本文から拾う", () => {
  const body = [
    "採点できなかった候補に仮の点をつけた。",
    "",
    "<details>",
    "<summary>補足</summary>",
    "",
    "本文（50 点）を記録した。",
    "",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(collectParens({ body }), [{ where: "details 1", token: "（50 点）" }]);
});

test("collectParens は文字列の行コメントから拾う", () => {
  const body = "採点できなかった候補に仮の点をつけた。";
  assert.deepStrictEqual(collectParens({ body, lineComments: ["採点の条件（50 点）を確認した。"] }), [
    { where: "行コメント 1", token: "（50 点）" },
  ]);
});

test("collectParens はオブジェクトの行コメントから拾う", () => {
  const body = "採点できなかった候補に仮の点をつけた。";
  const lineComments = [{ path: "lib/score.mjs", line: 12, numbered: false, text: "しきい値(50)を見直した。" }];
  assert.deepStrictEqual(collectParens({ body, lineComments }), [{ where: "行コメント 1", token: "(50)" }]);
});

test("collectParens は同じ丸括弧が 2 回出れば 2 件返す", () => {
  const body = [
    "採点できなかった候補に仮の点をつけた。",
    "",
    "<details>",
    "<summary>補足</summary>",
    "",
    "補足（注）と追記（注）を載せた。",
    "",
    "</details>",
  ].join("\n");
  assert.deepStrictEqual(collectParens({ body }), [
    { where: "details 1", token: "（注）" },
    { where: "details 1", token: "（注）" },
  ]);
});

test("checkAll の戻り値に parens があり展開部分の丸括弧は violations に入る", () => {
  const body = "採点できなかった候補に仮の点（50 点）をつけた。";
  const { parens, violations } = checkAll({ body }, { ...POLICY, "展開部分に丸括弧を禁止": true });
  assert.deepStrictEqual(parens, []);
  const hits = violations.filter((x) => x.rule === "展開部分に丸括弧を禁止");
  assert.strictEqual(hits.length, 1);
  assert.ok(hits[0].detail.includes("（50 点）"), hits[0].detail);
});

test("checkAll は details の丸括弧を parens に載せ違反にしない", () => {
  const body = [
    "採点できなかった候補に仮の点をつけた。",
    "",
    "<details>",
    "<summary>補足</summary>",
    "",
    "本文（50 点）。",
    "",
    "</details>",
  ].join("\n");
  const { parens, violations } = checkAll({ body }, { ...POLICY, "展開部分に丸括弧を禁止": true });
  assert.deepStrictEqual(parens, [{ where: "details 1", token: "（50 点）" }]);
  assert.ok(!violations.some((x) => x.rule === "展開部分に丸括弧を禁止"));
});

test("展開部分に丸括弧を禁止の分類は言い換え", () => {
  assert.strictEqual(classifyRule("展開部分に丸括弧を禁止"), "言い換え");
});

// ---- 生成ファイルへの行コメント ----

const GEN_RULE = "生成ファイルへの行コメント";
const gc = (path, line, numbered, text) => ({ path, line, numbered, text });

test("G01 番号コメントが生成ファイルに付くと違反 1 件になり detail にパスと行番号が入る", () => {
  const v = checkGeneratedFileComments([gc("yarn.lock", 3, true, "1: 依存を更新")], ["yarn.lock"]);
  assert.deepStrictEqual(v, [
    { rule: GEN_RULE, detail: "yarn.lock:3 に付いている。生成ファイルには行コメントを付けない" },
  ]);
});

test("G02 意図コメントが生成ファイルに付いても違反 1 件になる", () => {
  const v = checkGeneratedFileComments([gc("yarn.lock", 3, false, "依存を更新した理由")], ["yarn.lock"]);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].rule, GEN_RULE);
  assert.ok(v[0].detail.includes("yarn.lock:3"), v[0].detail);
});

test("G03 生成ファイルでないファイルへのコメントは違反にならない", () => {
  assert.deepStrictEqual(
    checkGeneratedFileComments([gc("src/a.js", 10, true, "1: 関数を足す")], ["yarn.lock"]),
    [],
  );
});

test("G04 生成ファイル一覧が空なら違反にならない", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([gc("yarn.lock", 3, true, "1: x")], []), []);
});

test("G05 一覧のパスの後ろに文字が付いたパスは違反にならない", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([gc("yarn.lock.bak", 1, true, "1: x")], ["yarn.lock"]), []);
});

test("G06 一覧のパスの前にディレクトリが付いたパスは違反にならない（完全一致のみ）", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([gc("sub/yarn.lock", 1, true, "1: x")], ["yarn.lock"]), []);
});

test("G07 一覧側のパスがより長い場合は違反にならない", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([gc("yarn.lock", 1, true, "1: x")], ["sub/yarn.lock"]), []);
});

test("G08 大文字小文字が違うパスは違反にならない（完全一致のみ）", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([gc("Yarn.lock", 1, false, "x")], ["yarn.lock"]), []);
});

test("G09 生成ファイル 2 件と通常 1 件のコメントから違反 2 件が出る", () => {
  const v = checkGeneratedFileComments(
    [gc("yarn.lock", 3, true, "1: a"), gc("src/a.js", 5, true, "2: b"), gc("dist/app.js", 7, false, "c")],
    ["yarn.lock", "dist/app.js"],
  );
  assert.strictEqual(v.length, 2);
  assert.ok(v.some((x) => x.detail.includes("yarn.lock:3")));
  assert.ok(v.some((x) => x.detail.includes("dist/app.js:7")));
  assert.ok(!v.some((x) => x.detail.includes("src/a.js")));
});

test("G10 同じ生成ファイルへの複数コメントは 1 件ずつ違反になる", () => {
  const v = checkGeneratedFileComments(
    [gc("yarn.lock", 3, true, "1: a"), gc("yarn.lock", 9, false, "b")],
    ["yarn.lock"],
  );
  assert.strictEqual(v.length, 2);
  assert.ok(v.some((x) => x.detail.includes("yarn.lock:3")));
  assert.ok(v.some((x) => x.detail.includes("yarn.lock:9")));
});

test("G11 コメントが空配列なら違反にならない", () => {
  assert.deepStrictEqual(checkGeneratedFileComments([], ["yarn.lock"]), []);
});

test("G12 一覧に複数のファイルがあるとき該当するものだけ違反になる", () => {
  const v = checkGeneratedFileComments([gc("b.gen.ts", 2, true, "1: x")], ["a.gen.ts", "b.gen.ts", "c.gen.ts"]);
  assert.strictEqual(v.length, 1);
  assert.ok(v[0].detail.includes("b.gen.ts:2"), v[0].detail);
});

test("G13 生成ファイルへの行コメントは骨格に分類される", () => {
  assert.strictEqual(classifyRule(GEN_RULE), "骨格");
});

test("G14 RULE_KINDS に生成ファイルへの行コメントが骨格で登録されている", () => {
  assert.strictEqual(RULE_KINDS[GEN_RULE], "骨格");
});

test("G15 checkAll は生成ファイルへのコメントを骨格の違反として返す", () => {
  const { violations } = checkAll(
    { body: "問題のない本文", lineComments: [gc("yarn.lock", 3, true, "1: 依存を更新")], generatedFiles: ["yarn.lock"] },
    POLICY,
  );
  const hits = violations.filter((v) => v.rule === GEN_RULE);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].kind, "骨格");
});

test("G16 checkAll は生成ファイルでないファイルへのコメントを違反にしない", () => {
  const { violations } = checkAll(
    { body: "問題のない本文", lineComments: [gc("src/a.js", 3, true, "1: 依存を更新")], generatedFiles: ["yarn.lock"] },
    POLICY,
  );
  assert.ok(!violations.some((v) => v.rule === GEN_RULE));
});

test("G17 checkAll は generatedFiles を省略しても例外を投げず新ルールの違反も出さない", () => {
  const { violations } = checkAll(
    { body: "問題のない本文", lineComments: [gc("yarn.lock", 3, true, "1: 依存を更新")] },
    POLICY,
  );
  assert.ok(!violations.some((v) => v.rule === GEN_RULE));
});

test("G18 checkAll は generatedFiles が空配列なら新ルールの違反を出さない", () => {
  const { violations } = checkAll(
    { body: "問題のない本文", lineComments: [gc("yarn.lock", 3, true, "1: 依存を更新")], generatedFiles: [] },
    POLICY,
  );
  assert.ok(!violations.some((v) => v.rule === GEN_RULE));
});

test("G19 checkAll は lineComments を省略して generatedFiles だけ渡しても例外を投げない", () => {
  const { violations } = checkAll({ body: "問題のない本文", generatedFiles: ["yarn.lock"] }, POLICY);
  assert.ok(!violations.some((v) => v.rule === GEN_RULE));
});

test("G20 checkAll は既存ルールの違反と新ルールの違反を併せて返す", () => {
  const { violations } = checkAll(
    { body: "大幅に改善しました。", lineComments: [gc("yarn.lock", 3, true, "1: 依存を更新")], generatedFiles: ["yarn.lock"] },
    POLICY,
  );
  assert.ok(violations.some((v) => v.rule === "禁止語"));
  const hit = violations.find((v) => v.rule === GEN_RULE);
  assert.ok(hit, "生成ファイルへの行コメントの違反が出ていない");
  assert.strictEqual(hit.kind, "骨格");
});

// CLI。generated を省略すると --generated-file を渡さない。
// raw を渡すとその文字列をそのまま一覧ファイルに書く。trailingFlag は値なしの --generated-file を末尾に置く。
const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "slop-check.mjs");
const POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "policy", "slop.json");

function cliArgs({ comments, generated, raw, missingPath, trailingFlag }) {
  const dir = mkdtempSync(join(tmpdir(), "slop-check-"));
  const bodyFile = join(dir, "body.md");
  const commentsFile = join(dir, "line-comments.json");
  writeFileSync(bodyFile, "問題のない本文");
  writeFileSync(commentsFile, JSON.stringify(comments));
  const args = [CLI_PATH, "--body-file", bodyFile, "--comments-file", commentsFile, "--policy", POLICY_PATH];
  if (missingPath) {
    args.push("--generated-file", join(dir, "no-such-file.json"));
  } else if (raw !== undefined || generated !== undefined) {
    const generatedFile = join(dir, "generated-files.json");
    writeFileSync(generatedFile, raw !== undefined ? raw : JSON.stringify(generated));
    args.push("--generated-file", generatedFile);
  }
  if (trailingFlag) args.push("--generated-file");
  return args;
}

const runCli = (opts) =>
  execFileSync(process.execPath, cliArgs(opts), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// 終了コードを問わずに標準出力の JSON を取る
function cliJson(opts) {
  let stdout;
  try {
    stdout = runCli(opts);
  } catch (err) {
    stdout = err.stdout;
  }
  return JSON.parse(stdout);
}

function assertCliFails(opts) {
  assert.throws(
    () => runCli(opts),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(String(err.stderr).trim().length > 0, "標準エラーに理由が出ていない");
      return true;
    },
  );
}

const YARN_COMMENT = [gc("yarn.lock", 3, true, "1: 依存を更新")];

test("G21 CLI: 一覧に載ったファイルへのコメントが骨格の違反として出力される", () => {
  const { violations } = cliJson({ comments: YARN_COMMENT, generated: ["yarn.lock"] });
  const hit = violations.find((v) => v.rule === GEN_RULE);
  assert.ok(hit, "生成ファイルへの行コメントの違反が出ていない");
  assert.strictEqual(hit.kind, "骨格");
});

test("G22 CLI: 一覧が空配列ならエラー終了せず新ルールの違反も出ない", () => {
  const out = runCli({ comments: YARN_COMMENT, generated: [] });
  assert.ok(!JSON.parse(out).violations.some((v) => v.rule === GEN_RULE));
});

test("G23 CLI: 一覧に載っていないファイルへのコメントは違反にならない", () => {
  const { violations } = cliJson({ comments: [gc("src/a.js", 3, true, "1: 依存を更新")], generated: ["yarn.lock"] });
  assert.ok(!violations.some((v) => v.rule === GEN_RULE));
});

test("G24 CLI: --generated-file を渡さないと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT });
});

test("G25 CLI: --generated-file のファイルが存在しないと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, missingPath: true });
});

test("G26 CLI: 一覧が JSON のオブジェクトだと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: '{"a":1}' });
});

test("G27 CLI: 一覧が JSON の文字列だと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: '"yarn.lock"' });
});

test("G28 CLI: 一覧の要素が数値だと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: "[1]" });
});

test("G29 CLI: 一覧に文字列以外が混ざると終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: '["yarn.lock", null]' });
});

test("G30 CLI: 一覧が JSON として壊れていると終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: '[ "yarn.lock"' });
});

test("G31 CLI: 一覧ファイルが空だと終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, raw: "" });
});

test("G32 CLI: --generated-file の値が欠けていると終了コード 1 で理由を出す", () => {
  assertCliFails({ comments: YARN_COMMENT, trailingFlag: true });
});
