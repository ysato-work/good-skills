import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readFile, SKILLS_DIR } from "../lib/read-file.mjs";
import { SPEC_CHECKS, PLAN_CHECKS } from "../lib/review-record.mjs";

function read(name) {
  return readFile(`${name}/SKILL.md`);
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
  assert.equal(/AskUserQuestion/.test(body), false, "AskUserQuestion が本文に残っている");
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
  assert.match(
    body,
    /Count only the reviewers' `Issues`/,
    "Issues だけを数える規定が無い",
  );
  assert.match(
    body,
    /conversation reviewer returned no issues/,
    "会話レビュー役の指摘を数える規定が無い",
  );
  assert.match(body, /are not issues/, "Recommendations を指摘に数えない規定が無い");
  assert.match(body, /There is no attempt limit/, "試行上限を置かない規定が無い");
});

test("spec reviewer プロンプトが決定事項と証拠を検査する", () => {
  const p = readFile(join("brainstorming", "spec-document-reviewer-prompt.md"));
  assert.match(p, /決定事項 coverage/, "決定事項の網羅の検査が無い");
  assert.match(p, /証拠 quality/, "証拠が原文引用かの検査が無い");
});

test("会話の記録を読む reviewer プロンプトが合否を判定しない", () => {
  const p = readFile(join("brainstorming", "spec-conversation-reviewer-prompt.md"));
  assert.match(p, /読み替え/, "読み替えの検査が無い");
  assert.match(p, /合格・不合格は判定しない/, "合否を判定しない旨が無い");
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
    "squeeze it into a short question",
    "the skip is back on",
    "know what this name means",
    "a summary is fine",
  ]) {
    assert.ok(body.includes(s), `Red Flags に「${s}」の行が無い`);
  }
});

test("brainstorming の Checklist が検証者の dispatch を含む 10 項目である", () => {
  const body = read("brainstorming");
  assert.match(body, /7\. \*\*Dispatch spec document reviewer\*\*/, "7 番目が検証者の dispatch でない");
  assert.match(
    body,
    /8\. \*\*Dispatch spec conversation reviewer\*\*/,
    "8 番目が会話の記録を読む検証者でない",
  );
  assert.match(body, /9\. \*\*User reviews written spec\*\*/, "9 番目が人間のレビューでない");
  assert.match(
    body,
    /10\. \*\*Transition to implementation\*\*/,
    "10 番目が writing-plans への移行でない",
  );
  assert.equal(/11\. \*\*/.test(body), false, "Checklist が 11 項目以上ある");
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

test("brainstorming が spec の必須要素を 9 つに限っている", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /Nine things are mandatory in every spec\. Any further section you need is\s+yours to add/,
    "必須は 9 つでそれ以外は自由という枠づけが消えている",
  );
  assert.match(
    body,
    /may be left as なし when there are none/,
    "任意 2 項目を なし にしてよい規定が消えている",
  );
});

test("brainstorming が設計書に 7 節の雛形を必須として持つ", () => {
  const body = read("brainstorming");
  for (const heading of [
    "## 課題",
    "## 解決策",
    "## 利用者の望み",
    "## 実装の決め事",
    "## テストの決め事",
    "## やらないこと",
    "## 補足",
  ]) {
    assert.ok(body.includes(heading), `7 節の見出し ${heading} が無い`);
  }
  assert.match(body, /Nine things are mandatory in every spec\./);
  assert.match(body, /Any further section you need is\s+yours to add/);
  assert.ok(
    body.includes("If there is nothing to list, write なし and say why"),
    "利用者の望みが無いときの書き方が無い",
  );
});

test("spec のレビュー役が 7 節の有無を点検する", () => {
  const prompt = readFile(join("brainstorming", "spec-document-reviewer-prompt.md"));
  assert.ok(prompt.includes("7節が揃っているか"), "レビュー役に 7 節の点検が無い");
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

test("brainstorming が調査を質問に先行させる", () => {
  const body = read("brainstorming");
  assert.match(body, /## Investigate Before You Ask/, "調査優先の節が無い");
  assert.match(body, /announce\s+what\s+you\s+will\s+investigate\s+in\s+one\s+line/, "着手の一言宣言の規定が無い");
  assert.match(body, /The\s+report\s+is\s+mandatory/, "報告必須の規定が無い");
  assert.match(body, /is\s+not\s+implementation/, "調査を実装から除外する規定が無い");
});

test("brainstorming の質問条件が揃っている", () => {
  const body = read("brainstorming");
  assert.match(body, /you\s+may\s+decide\s+at\s+your\s+own\s+discretion/, "裁量判断の分岐が無い");
  assert.match(body, /materially\s+changes\s+what\s+gets\s+built/, "ゴールへの影響の条件が無い");
  assert.match(body, /backcast\s+from\s+the\s+goal/, "ゴール逆算の条件が無い");
  assert.match(body, /unrelated\s+topics,\s+curiosity,\s+and\s+deferrable\s+confirmations/, "無関係な話題の禁止が無い");
  assert.match(body, /unknowns\s+that\s+block\s+the\s+goal/, "ゴールを塞ぐ不明点だけの提示が無い");
});

test("brainstorming が依頼範囲の制約を持つ", () => {
  const body = read("brainstorming");
  assert.match(body, /Your\s+autonomy\s+ends\s+where\s+the\s+human's\s+request\s+ends/, "自律の範囲の規定が無い");
  assert.match(body, /Never\s+start\s+work,\s+changes,\s+or\s+decisions\s+the\s+human\s+did\s+not\s+request/, "依頼していない作業の禁止が無い");
  assert.match(body, /propose\s+the\s+expansion\s+and\s+wait/, "範囲拡大は提案のみの規定が無い");
});

test("brainstorming の Spike 経路が一言宣言と報告必須に変わっている", () => {
  const body = read("brainstorming");
  assert.match(body, /no\s+approval\s+needed,\s+throwaway\s+code\s+allowed/, "Spike の承認不要・書き捨て許可が無い");
  assert.match(body, /anything\s+you\s+keep\s+is\s+a\s+new\s+request/, "Spike で残すコードの再分類規定が無い");
});

test("brainstorming の Checklist と Process Flow が調査先行に同期している", () => {
  const body = read("brainstorming");
  assert.equal(/Ask clarifying questions/.test(body), false, "「Ask clarifying questions」が残っている");
  assert.equal(/one at a time/.test(body), false);
  assert.equal(/Only one question per message/.test(body), false);
  assert.equal(/get\s+a\s+nod/.test(body), false, "承認待ち（nod）の文言が残っている");
  assert.equal(/Human\s+approves/.test(body), false, "dot に承認ゲートのノードが残っている");
  assert.equal(/present\s+the\s+probe/.test(body), false, "調査計画の提示と承認待ちの文言が残っている");
  assert.ok(body.includes("**Investigate unknowns**"), "Checklist に調査先行の項目が無い");
  assert.ok(body.includes("ask only what still blocks the goal"), "Checklist の質問条件の記述が無い");
  assert.ok(body.includes('"Investigate unknowns"'), "dot グラフのノードが調査先行になっていない");
});

test("brainstorming の Red Flags に調査放棄の言い訳が4行追加されている", () => {
  const body = read("brainstorming");
  assert.ok(body.includes("Asking the human is faster than researching"), "時間圧の言い訳の行が無い");
  assert.ok(body.includes("Research is the human's job"), "調査を人間の仕事とする言い訳の行が無い");
  assert.ok(body.includes("ask for approval before investigating"), "調査の承認を求める言い訳の行が無い");
  assert.ok(body.includes("just ask this one unrelated thing"), "無関係な質問の言い訳の行が無い");
});

test("finishing-a-development-branch が pr-description への委譲を持っている", () => {
  const body = read("finishing-a-development-branch");
  assert.match(
    body,
    /`pr-description` skill is on this session's skill list/,
    "委譲先のスキル名が無い",
  );
  assert.match(
    body,
    /whatever\s+plugin provides it/,
    "提供元のプラグインを問わない書き方になっていない",
  );
  assert.match(body, /--base=<base-branch>/, "派生元ブランチを渡す指示が無い");
  assert.match(
    body,
    /A detached HEAD is excluded because/,
    "切り離された HEAD を除外する理由の説明が無い",
  );
  assert.match(
    body,
    /never been pushed/,
    "委譲先が未 push のブランチしか push しないという前提の記述が無い",
  );
  assert.match(
    body,
    /remote is GitHub with `gh` available/,
    "委譲の条件に forge (GitHub / gh) の判定が無い",
  );
});

test("finishing-a-development-branch が委譲時に spec / plan ブロックを足さない", () => {
  const body = read("finishing-a-development-branch");
  assert.match(
    body,
    /Do not append the spec\/plan block/,
    "委譲したときにリンクを足さない規定が無い",
  );
});

test("finishing-a-development-branch が両経路とも CI 待ちに合流する", () => {
  const body = read("finishing-a-development-branch");
  assert.match(body, /\*\*Both paths continue here\.\*\*/, "両経路の合流点が明示されていない");
  assert.match(body, /gh pr checks <PR#> --watch/, "CI 待ちの手順が消えている");
});

test("finishing-a-development-branch が本文の自作という言い訳を封じている", () => {
  const body = read("finishing-a-development-branch");
  assert.match(
    body,
    /I'll just write the PR body myself/,
    "言い訳表に本文を自分で書く行が無い",
  );
});

test("NOTICE がフォーク改変として委譲の分岐を挙げている", () => {
  const notice = readFileSync(join(SKILLS_DIR, "..", "NOTICE.md"), "utf8");
  assert.match(
    notice,
    /`pr-description` スキルが使える環境では PR 作成をそのスキルに委譲する分岐/,
    "NOTICE に委譲の分岐が載っていない",
  );
});

test("積み上げの結合点となる節名が5スキルに揃っている", () => {
  for (const name of [
    "brainstorming",
    "writing-plans",
    "subagent-driven-development",
    "executing-plans",
    "finishing-a-development-branch",
  ]) {
    assert.ok(
      read(name).includes("この作業自体の進め方"),
      `${name} に「この作業自体の進め方」の節名が無い`,
    );
  }
});

test("brainstorming が問いをラウンドで出す", () => {
  const body = read("brainstorming");
  assert.match(body, /Ask the whole frontier in one round/);
  assert.match(body, /Word each question so "yes" accepts your recommended answer/);
  assert.match(body, /When the frontier is empty, stop asking and present the design/);
  assert.match(body, /dispatch a sub-agent to find it/);
  assert.match(body, /Decide where the tests attach/);
  assert.equal(/AskUserQuestion/.test(body), false, "AskUserQuestion が本文に残っている");
  assert.equal(/Two ways to ask/.test(body), false, "Two ways to ask が本文に残っている");
  assert.equal(/Never offer a single option/.test(body), false);
  assert.equal(/Do NOT pad to a fixed count either/.test(body), false);
});

test("User Review Gate のスキップ条件が2体ぶんの無指摘を1文で述べている", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /The skip only holds when both reviewers returned no issues\./,
    "スキップ条件が2体ぶんを1文で述べていない",
  );
});

test("Checklist の人間レビューの項が本文のスキップ条件に揃っている", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /SKIP this only if both reviewers returned no issues/,
    "Checklist が単数の reviewer で条件を述べている",
  );
});

test("prompt ファイルの読み込みが共通部品を使う", () => {
  const self = readFileSync(new URL(import.meta.url), "utf8");
  assert.equal(
    /readFileSync\(\s*join\(SKILLS_DIR, "(brainstorming|writing-plans)"/.test(self),
    false,
    "prompt ファイルを生の readFileSync で読んでいる箇所が残っている",
  );
});

test("brainstorming からもプラグイン共通の lib を参照する", () => {
  const body = read("brainstorming");
  assert.match(
    body,
    /node "\$\{CLAUDE_PLUGIN_ROOT\}\/lib\/transcript-text\.mjs"/,
    "brainstorming が共通 lib の transcript-text.mjs を参照していない",
  );
  assert.equal(
    /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/brainstorming\/lib\/transcript-text/.test(body),
    false,
    "brainstorming 自身の下に置いた経路が残っている",
  );
});

test("流れ図の判定の節点はレビュー役 2 体ぶんを数える", () => {
  const body = read("brainstorming");
  assert.match(body, /Both reviewers/, "2 体ぶんの節点が無い");
  assert.equal(
    /Reviewer's first pass clean\?/.test(body),
    false,
    "単数の節点名が残っている",
  );
});

test("共用スクリプトと読み込み部品の末尾に改行がある", () => {
  for (const rel of ["../lib/transcript-text.mjs", "../lib/transcript-text.test.mjs", "../lib/read-file.mjs"]) {
    const s = readFileSync(join(SKILLS_DIR, rel), "utf8");
    assert.ok(s.endsWith("\n"), `${rel} の末尾に改行が無い`);
  }
});

test("brainstorming の平文化が Claude Code でないときの判定から始まる", () => {
  const body = read("brainstorming");
  const skip = body.indexOf("CLAUDE_CODE_SESSION_ID` が無いとき");
  const workdir = body.indexOf("mkdir -p");
  assert.ok(skip > 0, "セッション ID の判定の記述が無い");
  assert.ok(workdir > 0, "workdir を作る規定が無い");
  assert.ok(
    skip < workdir,
    "飛ばす判定が workdir を作る手順より後にある。手順のまま読むと、セッション ID が無くても作業場所を作ってしまう",
  );
});

test("brainstorming の平文が空のときの扱いを自力で完結させる", () => {
  const body = read("brainstorming");
  assert.equal(
    body.includes("計画書側と同じく「無い」と書いて渡す"),
    false,
    "空のときの扱いを計画書側の記述に委ねている",
  );
  assert.match(
    body,
    /記録が空のときは、その旨を書いたファイルを渡す。レビュー役は検査しない/,
    "空のときの扱いが書かれていない",
  );
});

test("設計書が共用スクリプト・読み込み部品・道具・作業場所を載せている", (t) => {
  const specPath = join(
    SKILLS_DIR, "..", "..", "docs", "superpowers", "specs", "2026-10-12-要求の読み替え検査-design.md",
  );
  if (!existsSync(specPath)) {
    return t.skip("設計書はプラグインの外にあり、プラグインだけの配布では検査しない");
  }
  const spec = readFileSync(specPath, "utf8");
  assert.match(spec, /kiai-sp\/lib\/transcript-text\.mjs/, "設計書が旧位置の平文化スクリプトを指している");
  assert.match(spec, /kiai-sp\/lib\/read-file\.mjs/, "設計書の作るものに read-file.mjs が無い");
  assert.match(spec, /Read と Grep|Read, Grep/, "設計書にレビュー役の道具の指定が無い");
  assert.match(spec, /mkdir -p/, "設計書に workdir を作る規約が無い");
  assert.match(
    spec, /末尾に改行/, "設計書に共用スクリプト・読み込み部品の末尾改行の検査の記述が無い",
  );
});
