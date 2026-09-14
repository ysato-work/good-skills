import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTING_SKILLS } from "../../lib/spec-testing/guard-hook.mjs";
import { CHUNK_SIZE } from "./lib/chunk-cases.mjs";
import { MAX_SCORE_ATTEMPTS } from "./lib/score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = join(HERE, "references");
const AGENTS = join(HERE, "..", "..", "agents", "generating-spec-tests");
const SKILL = readFileSync(join(HERE, "SKILL.md"), "utf8");

const AGENT_NAMES = ["case-reviewer", "whole-reviewer", "judge", "confidence-scorer"];
const PHASES = [
  "phase-0-enumerate",
  "phase-1-bundle",
  "phase-2-review",
  "phase-3-judge",
  "phase-4-confidence",
  "phase-5-filter",
  "phase-6-apply",
  "phase-7-loop",
  "phase-8-ledger",
];

test("スキル名が S2 のガードが装填する名前と一致する", () => {
  assert.equal(TESTING_SKILLS[0], "generating-spec-tests");
  assert.match(SKILL, /^name: generating-spec-tests$/m);
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
  for (const name of AGENT_NAMES) {
    assert.ok(existsSync(join(AGENTS, `${name}.md`)), `${name}.md が agents 側に無い`);
    assert.equal(
      existsSync(join(HERE, "agents", `${name}.md`)),
      false,
      `${name}.md を skills 側に置いている。subagent_type で参照できなくなる`,
    );
  }
});

test("エージェント定義に name と description と model がある", () => {
  for (const name of AGENT_NAMES) {
    const body = readFileSync(join(AGENTS, `${name}.md`), "utf8");
    assert.match(body, new RegExp(`^name: ${name}$`, "m"), `${name} の name がずれている`);
    assert.match(body, /^description: .+$/m, `${name} に description が無い`);
    assert.match(body, /^model: \w+$/m, `${name} に model が無い`);
  }
});

test("レビュアが 5 つの判定軸を全部持っている", () => {
  const body = readFileSync(join(AGENTS, "case-reviewer.md"), "utf8");
  for (const axis of ["feasibility", "validity", "coverage", "box", "out-of-scope"]) {
    assert.ok(body.includes(axis), `判定軸 ${axis} が無い`);
  }
});

test("レビュアに過剰検出への歯止めが書かれている", () => {
  for (const name of ["case-reviewer", "whole-reviewer"]) {
    const body = readFileSync(join(AGENTS, `${name}.md`), "utf8");
    assert.match(body, /無理に見つけようとしない/, `${name} に歯止めが無い`);
  }
});

test("JSON を Write するエージェント全員に自己検証ループがある", () => {
  for (const name of AGENT_NAMES) {
    const body = readFileSync(join(AGENTS, `${name}.md`), "utf8");
    assert.match(body, /validate-json\.mjs/, `${name} に自己検証が無い`);
    assert.match(body, /最大 3 回/, `${name} に再試行の上限が無い`);
  }
});

test("採点フェーズが上限を超えたらエラー停止すると書いてある", () => {
  const body = readFileSync(join(REFS, "phase-5-filter.md"), "utf8");
  assert.ok(body.includes(String(MAX_SCORE_ATTEMPTS)), "試行上限がコードとずれている");
  assert.match(body, /中間値で埋めない/);
});

test("反映フェーズにスキップ禁止の明文がある", () => {
  const body = readFileSync(join(REFS, "phase-6-apply.md"), "utf8");
  assert.match(body, /スキップは絶対に禁止/);
});

test("ループフェーズの終了条件が決定論式だけになっている", () => {
  const body = readFileSync(join(REFS, "phase-7-loop.md"), "utf8");
  assert.match(body, /should-continue\.mjs/);
  assert.match(body, /REVIEW_MAX_ROUNDS/, "max_iter が定数からではなく直書きになっている");
  assert.equal(body.includes("収束"), false, "主観的な終了条件が残っている");
});

test("周回上限が constants.mjs の REVIEW_MAX_ROUNDS と初期値で揃っている", async () => {
  const { REVIEW_MAX_ROUNDS } = await import("../../lib/spec-testing/constants.mjs");
  assert.equal(REVIEW_MAX_ROUNDS, 2);
});

test("チャンクサイズが文書とコードでずれていない", () => {
  const body = readFileSync(join(REFS, "phase-1-bundle.md"), "utf8");
  assert.ok(body.includes(String(CHUNK_SIZE)), "チャンクサイズがコードとずれている");
});
