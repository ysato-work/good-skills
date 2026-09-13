import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEC_CHECKS, PLAN_CHECKS } from "../lib/review-record.mjs";

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

function read(name) {
  return readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8");
}

test("手を抜く許可の文言が両スキルから消えている", () => {
  for (const name of ["brainstorming", "writing-plans"]) {
    assert.equal(
      read(name).includes("No need to re-review"),
      false,
      `${name} に「No need to re-review」が残っている`,
    );
  }
});

test("writing-plans から subagent 否定の文言が消えている", () => {
  assert.equal(read("writing-plans").includes("not a subagent dispatch"), false);
});

test("両スキルが記録コマンドを案内している", () => {
  for (const name of ["brainstorming", "writing-plans"]) {
    assert.match(read(name), /review-record\.mjs" write/, `${name} に記録コマンドが無い`);
  }
});

test("writing-plans が plan reviewer の dispatch を指示している", () => {
  const body = read("writing-plans");
  assert.match(body, /plan-document-reviewer-prompt\.md/);
  assert.match(
    body,
    /--reviewer-status approved/,
    "writing-plans の記録コマンド例がゲートの受理する小文字の approved を渡していない",
  );
});

test("セルフレビュー観点は変更されていない", () => {
  const spec = read("brainstorming");
  for (const item of SPEC_CHECKS) {
    assert.ok(spec.includes(item), `brainstorming から観点 ${item} が消えている`);
  }
  const plan = read("writing-plans");
  for (const item of PLAN_CHECKS) {
    assert.ok(plan.includes(item), `writing-plans から観点 ${item} が消えている`);
  }
});

test("brainstorming から Bounded パスが消えている", () => {
  const body = read("brainstorming");
  assert.equal(/\*\*Bounded\*\*/.test(body), false, "Three Paths の Bounded の項が残っている");
  assert.equal(
    /spike \/ bounded \/ architectural/.test(body),
    false,
    "3 パスの列挙が残っている",
  );
  assert.equal(/\*\*Bounded:\*\*/.test(body), false, "Checklist の Bounded 節が残っている");
  assert.match(body, /## Two Paths/, "Two Paths の見出しが無い");
  assert.match(body, /\*\*Spike\*\*/, "Spike の項が消えている");
});

test("brainstorming に spec を書かない抜け道が残っていない", () => {
  const body = read("brainstorming");
  assert.equal(
    /two sentences in chat/i.test(body),
    false,
    "「設計はチャット 2 文でよい」が残っている",
  );
});

test("フォーク独自の規約が 6.3.0 の取り込みで消えていない", () => {
  const body = read("brainstorming");
  assert.match(body, /<Japanese topic>/, "spec ファイル名の日本語規約が消えている");
  assert.match(body, /\*\*Path and naming:\*\*/, "Path and naming 節が消えている");
  assert.match(body, /<work-root>/, "work-root プレースホルダ規約が消えている");
  assert.match(body, /<repo-root>/, "repo-root プレースホルダ規約が消えている");
  assert.match(body, /all five are required/, "記録コマンドの必須項目数の説明が消えている");
  assert.match(
    body,
    /MUST be the absolute path/,
    "記録は絶対パスで渡せという段落が消えている",
  );
  assert.match(
    body,
    /\*\*Do not babysit background work\.\*\*/,
    "バックグラウンド作業を待つなの段落が消えている",
  );
});

test("brainstorming が選択肢優先と 2〜3 案の縛りを持たない", () => {
  const body = read("brainstorming");
  assert.equal(/Prefer multiple choice/.test(body), false, "選択肢優先の規定が残っている");
  assert.equal(
    /2-3 different approaches/.test(body),
    false,
    "2〜3 案を出せという規定が残っている",
  );
  assert.equal(
    /Lead with your recommended option/.test(body),
    false,
    "推奨案を先頭に置けという規定が残っている",
  );
});

test("brainstorming が人間と話すときの作法を持っている", () => {
  const body = read("brainstorming");
  assert.match(body, /## Talking To Your Human Partner/, "作法の節が無い");
  assert.match(
    body,
    /Do NOT use `AskUserQuestion`/,
    "難しい論点で AskUserQuestion を禁じる規定が無い",
  );
  assert.match(body, /Never ask permission first/, "アスキーアートを許可なしで描く規定が無い");
  assert.match(
    body,
    /only when your partner asks for it/,
    "ブラウザは頼まれたときだけという規定が無い",
  );
  assert.match(
    body,
    /The decision is always your human partner's/,
    "最終決定は常に人間という規定が無い",
  );
  assert.match(
    body,
    /no separate phase for letting your partner talk/,
    "専用フェーズを作らない規定が無い",
  );
});

test("brainstorming が spec の必須要素を課している", () => {
  const body = read("brainstorming");
  assert.match(body, /\*\*Required spec content:\*\*/, "必須要素の節が無い");
  assert.match(
    body,
    /このファイルには会話で合意したことだけを書く/,
    "冒頭の宣言の要求が無い",
  );
  assert.match(body, /## 決定事項/, "決定事項セクションの要求が無い");
  assert.match(body, /<p>証拠: /, "決定事項のテンプレートが無い");
  assert.match(body, /日時, 決定者 and 証拠 are required/, "必須項目の指定が無い");
  assert.match(
    body,
    /quote the parts the implementation depends on verbatim/,
    "渡された資料を原文引用する規定が無い",
  );
  assert.match(
    body,
    /never paraphrase it/,
    "証拠を要約するなという規定が無い",
  );
});

test("brainstorming が spec reviewer の dispatch を指示している", () => {
  const body = read("brainstorming");
  assert.match(body, /spec-document-reviewer-prompt\.md/, "reviewer プロンプトへの参照が無い");
  assert.match(
    body,
    /--reviewer-status approved/,
    "記録コマンドがゲートの受理する小文字の approved を渡していない",
  );
});

test("brainstorming の承認スキップが 1 回目の検証に縛られている", () => {
  const body = read("brainstorming");
  assert.match(body, /FIRST pass/, "1 回目の検証で判定する規定が無い");
  assert.match(
    body,
    /does not\s+buy the skip back/,
    "後で綺麗になってもスキップ権が戻らない規定が無い",
  );
  assert.match(body, /Count only the reviewer's `Issues`/, "Issues だけを数える規定が無い");
  assert.match(body, /are not issues/, "Recommendations を指摘に数えない規定が無い");
  assert.match(body, /There is no attempt limit/, "試行上限を置かない規定が無い");
});

test("spec reviewer プロンプトが決定事項と証拠を検査する", () => {
  const p = readFileSync(
    join(SKILLS_DIR, "brainstorming", "spec-document-reviewer-prompt.md"),
    "utf8",
  );
  assert.match(p, /決定事項 coverage/, "決定事項の網羅の検査が無い");
  assert.match(p, /証拠 quality/, "証拠が原文引用かの検査が無い");
});

test("brainstorming がブラウザを自分から提案しない", () => {
  const body = read("brainstorming");
  assert.equal(
    /Offering the companion/.test(body),
    false,
    "ブラウザを提案する段落が残っている",
  );
  assert.equal(
    /This offer MUST be its own message/.test(body),
    false,
    "提案の作法の段落が残っている",
  );
  assert.equal(
    /Per-question decision/.test(body),
    false,
    "質問ごとにブラウザか端末かを AI が決める記述が残っている",
  );
  assert.equal(
    /Offer the visual companion just-in-time/.test(body),
    false,
    "Checklist にブラウザを提案する項が残っている",
  );
});

test("brainstorming の Red Flags が新しい規定の言い訳を封じている", () => {
  const body = read("brainstorming");
  for (const s of [
    "compress it into a chip",
    "the skip is back on",
    "know what this name means",
    "reads cleaner than three options",
    "a summary is fine",
  ]) {
    assert.ok(body.includes(s), `Red Flags に「${s}」の行が無い`);
  }
});

test("brainstorming の Checklist が検証者の dispatch を含む 9 項目である", () => {
  const body = read("brainstorming");
  assert.match(body, /7\. \*\*Dispatch spec document reviewer\*\*/, "7 番目が検証者の dispatch でない");
  assert.match(body, /8\. \*\*User reviews written spec\*\*/, "8 番目が人間のレビューでない");
  assert.match(
    body,
    /9\. \*\*Transition to implementation\*\*/,
    "9 番目が writing-plans への移行でない",
  );
  assert.equal(/10\. \*\*/.test(body), false, "Checklist が 10 項目以上ある");
  assert.equal(
    /Propose 2-3/.test(body),
    false,
    "Checklist か dot グラフに 2〜3 案の縛りが残っている",
  );
});

test("brainstorming の Visual Companion 節が頼まれたときだけ開く形になっている", () => {
  const body = read("brainstorming");
  assert.match(body, /## Visual Companion/, "Visual Companion 節が無い");
  assert.match(
    body,
    /It opens ONLY when your human partner asks for it/,
    "頼まれたときだけ開く規定が無い",
  );
  assert.match(
    body,
    /Do not offer it, and do not decide on their behalf/,
    "AI から提案しない規定が無い",
  );
});

test("brainstorming の Process Flow が本文と食い違わない", () => {
  const body = read("brainstorming");
  assert.equal(
    /"Propose 2-3 approaches"/.test(body),
    false,
    "dot グラフに 2〜3 案のノードが残っている",
  );
  assert.match(body, /"Dispatch spec reviewer"/, "dot グラフに検証者のノードが無い");
});


test("記録コマンドが検証者の dispatch より後に置かれている", () => {
  const body = read("brainstorming");
  const dispatch = body.indexOf("**Spec Document Review:**");
  const block = body.indexOf('node "${CLAUDE_PLUGIN_ROOT}/lib/review-record.mjs" write');
  assert.ok(dispatch > 0, "Spec Document Review 節が無い");
  assert.ok(block > 0, "記録コマンドが無い");
  assert.ok(
    dispatch < block,
    "記録コマンドが検証者の dispatch より前にある。この順序だとゲートが必ず落ちる",
  );
});

test("brainstorming が理解を壊す 4 パターンを列挙している", () => {
  const body = read("brainstorming");
  for (const s of [
    "Talk in unagreed identifiers",
    "Put the conclusion after its premises",
    "Use phrasing that hides who does what",
    "Refer back with",
  ]) {
    assert.ok(body.includes(s), `わかる言葉の 4 パターンから「${s}」が消えている`);
  }
});

test("brainstorming が spec の必須要素を 2 つだけに限っている", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /Two things are mandatory in every spec\. Everything else about the document\s+is yours to shape\./,
    "必須は 2 つでそれ以外は自由という枠づけが消えている",
  );
  assert.match(
    body,
    /may be left as なし when there are none/,
    "任意 2 項目を なし にしてよい規定が消えている",
  );
});

test("brainstorming が 1 回目の検証の指摘を記録させている", () => {
  const body = read("brainstorming");
  assert.match(body, /--reviewer-issue/, "1 回目の指摘を記録する指示が無い");
  assert.match(
    body,
    /never record a\s+verdict you did not read/,
    "読んでいない判定を記録するなという規定が無い",
  );
});

test("brainstorming が spec の再コミットを指示している", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /Commit again after the self-review/,
    "レビュー後の再コミットの指示が無い",
  );
});
