import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractTaskBrief, extractGlobalConstraints } from './prepare-task.mjs';

const PLAN = `# Demo Plan

## Global Constraints

- Node >= 20
- No new dependencies

---

### Task 1: First thing

**Files:**
- Create: a.js

- [ ] Step 1

### Task 2: Second thing

**Files:**
- Create: b.js

- [ ] Step 1
`;

test('extractTaskBrief: 指定タスクの見出しから次の見出し直前までを抜き出す', () => {
  const brief = extractTaskBrief(PLAN, 1);
  assert.match(brief, /### Task 1: First thing/);
  assert.doesNotMatch(brief, /Task 2/);
});

test('extractTaskBrief: 存在しないタスク番号は throw する', () => {
  assert.throws(() => extractTaskBrief(PLAN, 99), /task 99 not found/);
});

test('extractGlobalConstraints: Global Constraints 節を抜き出す', () => {
  const gc = extractGlobalConstraints(PLAN);
  assert.match(gc, /Node >= 20/);
  assert.match(gc, /No new dependencies/);
  assert.doesNotMatch(gc, /Task 1/);
});

test('extractGlobalConstraints: 節が無い plan は throw する', () => {
  const noSection = PLAN.replace(/## Global Constraints[\s\S]*?---\n/, '');
  assert.throws(() => extractGlobalConstraints(noSection), /Global Constraints section not found/);
});
