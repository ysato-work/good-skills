// prompt-files.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_SDD = join(HERE, '..', 'subagent-driven-development');
const UPSTREAM_REVIEW = join(HERE, '..', 'requesting-code-review');

test('implementer-prompt.md は本家と無改変コピー', () => {
  assert.equal(
    readFileSync(join(HERE, 'implementer-prompt.md'), 'utf8'),
    readFileSync(join(UPSTREAM_SDD, 'implementer-prompt.md'), 'utf8'),
  );
});

test('re-review-prompt.md は本家と無改変コピー', () => {
  assert.equal(
    readFileSync(join(HERE, 're-review-prompt.md'), 'utf8'),
    readFileSync(join(UPSTREAM_SDD, 're-review-prompt.md'), 'utf8'),
  );
});

test('final-review-prompt.md は code-reviewer.md と無改変コピー', () => {
  assert.equal(
    readFileSync(join(HERE, 'final-review-prompt.md'), 'utf8'),
    readFileSync(join(UPSTREAM_REVIEW, 'code-reviewer.md'), 'utf8'),
  );
});

test('task-reviewer-prompt.md は本家 + Plan-mandated findings 1行だけの差分', () => {
  const upstream = readFileSync(join(UPSTREAM_SDD, 'task-reviewer-prompt.md'), 'utf8');
  const ours = readFileSync(join(HERE, 'task-reviewer-prompt.md'), 'utf8');
  assert.notEqual(ours, upstream);
  assert.match(ours, /\*\*Plan-mandated findings:\*\* \[none \| list of finding one-liners\]/);

  const upstreamLines = upstream.split('\n');
  const oursLines = ours.split('\n');
  assert.equal(oursLines.length, upstreamLines.length + 1, '追記は1行だけであるべき');
  const addedLines = oursLines.filter((l) => !upstreamLines.includes(l));
  assert.equal(addedLines.length, 1);
  assert.match(addedLines[0], /Plan-mandated findings/);
});

test('final-fixer-prompt.md が存在し、単一 fixer・再レビュー1回・2周目なしの骨格を持つ', () => {
  const text = readFileSync(join(HERE, 'final-fixer-prompt.md'), 'utf8');
  assert.match(text, /ONE fix subagent|one fixer/i);
  assert.match(text, /no second fix wave|2周目/i);
});

test('final-fixer-prompt.md は New HEAD の報告を必須項目として要求している', () => {
  const text = readFileSync(join(HERE, 'final-fixer-prompt.md'), 'utf8');
  assert.match(text, /\*\*New HEAD:\*\*/);
  assert.match(text, /New HEAD[\s\S]{0,200}commit SHA/i);
});

test('scripts/review-package は本家と無改変コピーで実行権限を持つ', () => {
  assert.equal(
    readFileSync(join(HERE, 'scripts', 'review-package'), 'utf8'),
    readFileSync(join(UPSTREAM_SDD, 'scripts', 'review-package'), 'utf8'),
  );
  const mode = statSync(join(HERE, 'scripts', 'review-package')).mode;
  assert.ok(mode & 0o111, 'review-package must be executable');
});
