// skill-md.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXT = () => readFileSync(join(HERE, 'SKILL.md'), 'utf8');

test('frontmatter の name はディレクトリ名と一致する', () => {
  const m = TEXT().match(/^---\nname:\s*([^\n]+)\n/);
  assert.ok(m);
  assert.equal(m[1].trim(), basename(HERE));
});

test('frontmatter に description がある', () => {
  assert.match(TEXT(), /^description:/m);
});

test('6つの status すべてに親の対応が書かれている', () => {
  for (const s of ['complete', 'fix_required', 'plan_conflict', 'capped', 'review_failed', 'fix_not_applied']) {
    assert.match(TEXT(), new RegExp(s), `${s} への対応が SKILL.md に無い`);
  }
});

test('実装者を workflow の中に入れない旨が明記されている', () => {
  assert.match(TEXT(), /実装者/);
  assert.match(TEXT(), /SendMessage/);
});

test('preset 3値がすべて言及されている', () => {
  for (const p of ['transcribe', 'standard', 'design']) assert.match(TEXT(), new RegExp(p));
});

test('mode:final の呼び出しに触れている', () => {
  assert.match(TEXT(), /mode:\s*'final'|mode:\s*"final"/);
});

test('mode:final の Workflow 呼び出し引数に planFile が含まれる', () => {
  assert.match(TEXT(), /mode:\s*'final'[\s\S]{0,400}planFile/);
});

test('plan_conflict の行が rulings の受け渡しを説明している', () => {
  assert.match(TEXT(), /rulings/);
  assert.match(TEXT(), /governs/);
});

test('fix_required の行が base 不変・fixBase 更新を説明している', () => {
  assert.match(TEXT(), /fixBase/);
});

test('complete の unverifiable と deferredMinors の扱いが書かれている', () => {
  assert.match(TEXT(), /unverifiable/);
  assert.match(TEXT(), /deferredMinors/);
});

test('final モードの review_failed が fixer の New HEAD 欠落も含む旨が書かれている', () => {
  assert.match(TEXT(), /New HEAD/);
});
