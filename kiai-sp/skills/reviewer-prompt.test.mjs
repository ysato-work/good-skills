import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile as read } from "../lib/read-file.mjs";

test("spec conversation reviewer の起動テンプレートは読み取り専用の道具を明示する", () => {
  const body = read("brainstorming/spec-conversation-reviewer-prompt.md");
  assert.match(body, /tools:\s*Read/, "読み取りの道具の明示が無い");
  assert.doesNotMatch(body, /tools:.*\b(Write|Edit|NotebookEdit)\b/, "書き換えの道具が継承されている");
});

test("spec conversation reviewer は記録に差し込み文が混ざりうる言い切りをしていない", () => {
  const body = read("brainstorming/spec-conversation-reviewer-prompt.md");
  assert.doesNotMatch(body, /発言だけが入っている/, "誤った断定が残っている");
  assert.match(body, /差し込んだ文/, "差し込み文の混入への注意が無い");
  assert.match(body, /判定に使わない/, "判定に使わない旨が無い");
});

test("spec conversation reviewer は読んだ内容が自分の記録にも残る旨の注意を持つ", () => {
  const body = read("brainstorming/spec-conversation-reviewer-prompt.md");
  assert.match(body, /読んだ内容.*残る/, "読んだ内容が記録に残る旨の注意が無い");
  assert.match(body, /完全には消せない/, "平文化では秘密を完全には消せない旨が無い");
});

test("spec conversation reviewer は会話の記録が空のとき検査しない", () => {
  const body = read("brainstorming/spec-conversation-reviewer-prompt.md");
  assert.match(body, /発言が 1 件も無い/, "記録が空のときの扱いが書かれていない");
  assert.match(body, /推測で埋め/, "推測で埋める禁止が書かれていない");
});

test("spec conversation reviewer の Recommendations の見出しは承認を前提としない", () => {
  const body = read("brainstorming/spec-conversation-reviewer-prompt.md");
  assert.doesNotMatch(
    body,
    /do not block approval/,
    "承認を阻まない前提を述べる文言が残っている",
  );
  assert.match(body, /\*\*Recommendations \(advisory\):\*\*/, "advisory の見出しが無い");
});

test("brainstorming の設計書が会話レビュー役の Recommendations の欄に言及している", () => {
  const body = read("brainstorming/SKILL.md");
  assert.match(
    body,
    /`Recommendations \(advisory\)`/,
    "設計書に Recommendations の欄の言及が無い",
  );
});

test("brainstorming の設計書側の節も、記録が空のときの渡し方を書いている", () => {
  const body = read("brainstorming/SKILL.md");
  const start = body.indexOf("spec-conversation-reviewer-prompt.md");
  const end = body.indexOf("**User Review Gate:**");
  const specConversation = body.slice(start, end);
  assert.match(specConversation, /記録が空のときは、その旨を書いたファイルを渡す/, "記録が空のときの扱いが設計書側の節に無い");
  assert.match(specConversation, /レビュー役は検査しない/, "検査しない旨が無い");
});

test("レビュー役の起動テンプレートは本文を書き換えさせる指示を持たない", () => {
  for (const name of ["brainstorming/spec-conversation-reviewer-prompt.md", "writing-plans/plan-document-reviewer-prompt.md"]) {
    const body = read(name);
    assert.equal(
      /書き換え|edit the plan|edit the spec|fix the plan yourself|fix the spec yourself/i.test(body),
      false,
      `${name} にレビュー役が本文を直す指示が入っている`,
    );
    assert.match(body, /Recommendations \(advisory/, `${name} に提言の欄が無い`);
  }
});
