import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTING_SKILLS } from "../../lib/spec-testing/guard-hook.mjs";
import { RESULT_STATUSES } from "./lib/apply-result.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = join(HERE, "references");
const AGENTS = join(HERE, "..", "..", "agents", "executing-spec-tests");
const SKILL = readFileSync(join(HERE, "SKILL.md"), "utf8");
const RUNNER = readFileSync(join(AGENTS, "case-runner.md"), "utf8");

const PHASES = [
  "phase-0-prepare",
  "phase-1-environment",
  "phase-2-run-one",
  "phase-3-record",
  "phase-4-loop",
  "phase-5-teardown",
];

test("スキル名が S2 のガードが装填する名前と一致する", () => {
  assert.equal(TESTING_SKILLS[1], "executing-spec-tests");
  assert.match(SKILL, /^name: executing-spec-tests$/m);
});

test("SKILL.md に description がある", () => {
  assert.match(SKILL, /^description: .{20,}$/m);
});

test("すべての phase reference が存在し、SKILL.md から参照されている", () => {
  for (const phase of PHASES) {
    assert.ok(existsSync(join(REFS, `${phase}.md`)), `${phase}.md が無い`);
    assert.ok(SKILL.includes(`${phase}.md`), `SKILL.md が ${phase}.md を参照していない`);
  }
});

test("references に SKILL.md から参照されていないファイルが無い", () => {
  for (const name of readdirSync(REFS)) {
    if (name === "COMMON-DEFINITIONS.md") continue;
    assert.ok(SKILL.includes(name), `${name} がどこからも参照されていない`);
  }
});

test("エージェント定義が agents ディレクトリ側に置かれている", () => {
  assert.ok(existsSync(join(AGENTS, "case-runner.md")));
  assert.equal(existsSync(join(HERE, "agents", "case-runner.md")), false);
});

test("case-runner に name と description と model がある", () => {
  assert.match(RUNNER, /^name: case-runner$/m);
  assert.match(RUNNER, /^description: .+$/m);
  assert.match(RUNNER, /^model: \w+$/m);
});

test("case-runner が返せる status が apply-result と一致している", () => {
  for (const status of RESULT_STATUSES) {
    assert.ok(RUNNER.includes(`\`${status}\``), `case-runner に ${status} の説明が無い`);
  }
  assert.match(RUNNER, /`out_of_scope` は返さない/);
});

test("case-runner に生出力を親へ返さない指示がある", () => {
  assert.match(RUNNER, /テストの生出力を返さない/);
});

test("case-runner にテスト対象を修正しない指示がある", () => {
  assert.match(RUNNER, /テスト対象コードの修正/);
});

test("実行フェーズにスキップ禁止の明文と言い訳の列挙がある", () => {
  const body = readFileSync(join(REFS, "phase-2-run-one.md"), "utf8");
  assert.match(body, /スキップは絶対に禁止/);
  for (const excuse of ["偽陽性", "確認済み", "リスク", "機械的", "時間がかかり", "明らかに通る"]) {
    assert.ok(body.includes(excuse), `言い訳「${excuse}」が列挙されていない`);
  }
});

test("実行フェーズに実施時の out_of_scope 禁止が書かれている", () => {
  const body = readFileSync(join(REFS, "phase-2-run-one.md"), "utf8");
  assert.match(body, /実施時に新しく対象外を作らない/);
});

test("記録フェーズが親にテスト出力を読ませない", () => {
  const body = readFileSync(join(REFS, "phase-3-record.md"), "utf8");
  assert.match(body, /親はログを開かない/);
});

test("ループフェーズの終了条件が検査スクリプトに委ねられている", () => {
  const body = readFileSync(join(REFS, "phase-4-loop.md"), "utf8");
  assert.match(body, /check-progress\.mjs/);
  assert.match(body, /--phase execution/);
  assert.equal(body.includes("収束"), false, "主観的な終了条件が残っている");
});

test("後始末フェーズが環境の残留を確認する", () => {
  const body = readFileSync(join(REFS, "phase-5-teardown.md"), "utf8");
  assert.match(body, /env-snapshot\.mjs/);
});

test("結合と E2E を足したときに単体の収集対象を確認する手順がある", () => {
  const body = readFileSync(join(REFS, "phase-5-teardown.md"), "utf8");
  assert.match(body, /collection-diff\.mjs/);
});

test("準備フェーズが既存のTier2資源の残留を確認する", () => {
  const body = readFileSync(join(REFS, "phase-0-prepare.md"), "utf8");
  assert.match(body, /env-snapshot\.mjs/);
  assert.match(body, /spec-testing-/);
});

test("準備フェーズで目標条件の設定を促している", () => {
  const body = readFileSync(join(REFS, "phase-0-prepare.md"), "utf8");
  assert.match(body, /目標条件/);
  assert.match(body, /todo が 0 件/);
});

test("Phase 6 の納品が SKILL.md から参照されている", () => {
  assert.ok(existsSync(join(REFS, "phase-6-deliver.md")));
  assert.ok(SKILL.includes("phase-6-deliver.md"));
});

test("納品フェーズが許可リストの検査を通してから commit する", () => {
  const body = readFileSync(join(REFS, "phase-6-deliver.md"), "utf8");
  const checkAt = body.indexOf("delivery-check.mjs");
  const commitMatch = body.match(/\bgit\b[^\n]*\bcommit\b/);
  assert.ok(checkAt !== -1, "許可リストの検査が無い");
  assert.ok(commitMatch, "commit が無い");
  assert.ok(checkAt < commitMatch.index, "commit のあとに検査している");
});

test("納品フェーズに人間への問いかけが無い", () => {
  const body = readFileSync(join(REFS, "phase-6-deliver.md"), "utf8");
  assert.match(body, /人間に尋ねない/);
  assert.equal(body.includes("AskUserQuestion"), false);
});

test("納品フェーズが CI 設定を触らないと明記している", () => {
  const body = readFileSync(join(REFS, "phase-6-deliver.md"), "utf8");
  assert.match(body, /CI 設定/);
});

test("起点の確定が 6.1 より前にあり、以降は collectGit を呼び直さない", () => {
  const body = readFileSync(join(REFS, "phase-6-deliver.md"), "utf8");
  const at60 = body.indexOf("## 6.0");
  const at61 = body.indexOf("## 6.1");
  const at63 = body.indexOf("## 6.3");
  assert.ok(at60 !== -1 && at60 < at61, "6.0 が 6.1 より前に無い");
  assert.equal(body.includes("<検証開始時点のブランチ>"), false, "未解決のプレースホルダが残っている");
  assert.equal(body.includes("<差分の範囲>"), false, "未解決のプレースホルダが残っている");
  // `m.collectGit(...)` という実際の呼び出し形だけを数える。地の文の
  // 「collectGit() を呼び直さない」という説明への言及は呼び出しではない
  const collectGitCalls = (body.match(/\bm\.collectGit\(/g) ?? []).length;
  assert.equal(collectGitCalls, 1, "collectGit を複数箇所で呼んでいる。6.0 の値を使い回すこと");
  assert.ok(at63 > at60, "6.3 が 6.0 より前にある");
});
