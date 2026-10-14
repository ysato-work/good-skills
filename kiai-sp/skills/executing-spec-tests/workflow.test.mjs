import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOW_PATH = join(dirname(fileURLToPath(import.meta.url)), "workflow.mjs");

test("workflow.mjs は export const meta を持つ", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf8");
  assert.match(src, /export const meta\s*=/);
});

test("workflow.mjs の meta.phases は 4 段階を宣言", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf8");
  for (const title of ["Phase1", "Phase2", "Phase3", "Phase4"]) {
    assert.ok(src.includes(title), `meta.phases に ${title} が無い`);
  }
});

test("workflow.mjs は Date.now / Math.random / new Date() を呼ばない", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf8");
  assert.doesNotMatch(src, /\bDate\.now\s*\(/);
  assert.doesNotMatch(src, /\bMath\.random\s*\(/);
  assert.doesNotMatch(src, /\bnew\s+Date\s*\(\s*\)/);
});

test("workflow.mjs は agent() 呼び出しに model を明示している", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf8");
  // agent(prompt, {...model: 'haiku'|'sonnet'...}) の形が 6 回以上あることを確認
  const matches = src.match(/agent\s*\([\s\S]+?model:\s*['"](haiku|sonnet)['"]/g) ?? [];
  assert.ok(matches.length >= 6, `agent() で model 明示が ${matches.length} 件、6 件以上必要`);
});

test("workflow.mjs は Phase2 ループ内で、batch を受け取った直後 (no batch, exit loop の break の後) かつ最初の agent() 呼び出しより前に batch.level/caseIds を検証する", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf8");
  const loopStart = src.indexOf("for (let iter = 0; iter < MAX_ITER; iter++)");
  assert.ok(loopStart !== -1, "Phase2 ループが見つからない");

  const breakPos = src.indexOf("no batch, exit loop", loopStart);
  assert.ok(breakPos !== -1, "batch null チェックの break が見つからない");
  const afterBreak = src.slice(breakPos);

  const levelCheck = afterBreak.indexOf("LEVEL_RE");
  const caseIdCheck = afterBreak.indexOf("CASE_ID_RE");
  assert.ok(levelCheck !== -1, "LEVEL_RE によるバリデーションが無い");
  assert.ok(caseIdCheck !== -1, "CASE_ID_RE によるバリデーションが無い");

  const firstAgentCallAfterBreak = afterBreak.indexOf("agent(");
  assert.ok(firstAgentCallAfterBreak !== -1, "break の後に agent() 呼び出しが無い");

  assert.ok(levelCheck < firstAgentCallAfterBreak, "LEVEL_RE の検証が最初の agent() 呼び出しより後にある");
  assert.ok(caseIdCheck < firstAgentCallAfterBreak, "CASE_ID_RE の検証が最初の agent() 呼び出しより後にある");
});
