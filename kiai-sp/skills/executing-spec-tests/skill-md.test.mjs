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
const RUNNER = readFileSync(join(AGENTS, "batch-runner.md"), "utf8");

const PHASES = ["phase-0-prepare"];
const RETIRED_PHASES = [
  "phase-1-environment.md",
  "phase-2-run-one.md",
  "phase-3-record.md",
  "phase-4-loop.md",
  "phase-5-teardown.md",
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
  assert.ok(existsSync(join(AGENTS, "batch-runner.md")));
  assert.equal(existsSync(join(HERE, "agents", "batch-runner.md")), false);
});

test("batch-runner に name と description と model がある", () => {
  assert.match(RUNNER, /^name: batch-runner$/m);
  assert.match(RUNNER, /^description: .+$/m);
  assert.match(RUNNER, /^model: \w+$/m);
});

test("batch-runner が返せる status が apply-result と一致している", () => {
  for (const status of RESULT_STATUSES) {
    assert.ok(RUNNER.includes(`\`${status}\``), `batch-runner に ${status} の説明が無い`);
  }
  assert.match(RUNNER, /`out_of_scope` は返さない/);
});

test("batch-runner に生出力を親へ返さない指示がある", () => {
  assert.match(RUNNER, /生ログを返さない/);
});

test("batch-runner にテスト対象を修正しない指示がある", () => {
  assert.match(RUNNER, /テスト対象コードの修正/);
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

test("SKILL.md は workflow を起動する旨を含む", () => {
  assert.match(SKILL, /workflow/i);
  for (const name of RETIRED_PHASES) {
    assert.equal(SKILL.includes(name), false, `SKILL.md に ${name} への参照が残っている`);
  }
});

test("SKILL.md は Workflow 不採用時の理由を含まない (採用したので)", () => {
  assert.equal(SKILL.includes("workflow 化しない理由"), false);
});

test("references/ から phase-1〜5 のファイルが消えている", () => {
  for (const name of RETIRED_PHASES) {
    assert.equal(existsSync(join(REFS, name)), false, `${name} が残っている`);
  }
});

test("references/workflow-invocation.md が存在する", () => {
  assert.equal(existsSync(join(REFS, "workflow-invocation.md")), true);
});
