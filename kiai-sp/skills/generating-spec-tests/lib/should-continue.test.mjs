import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldContinue } from './should-continue.mjs';

test('continues when passed >= 1 and iter < max_iter', () => {
  const r = shouldContinue({ passed: 3, iter: 2, max_iter: 10 });
  assert.equal(r.decision, 'continue');
});

test('stops when passed == 0', () => {
  const r = shouldContinue({ passed: 0, iter: 2, max_iter: 10 });
  assert.equal(r.decision, 'stop');
  assert.equal(r.reason, 'no-passed');
});

test('stops when iter reaches max_iter', () => {
  const r = shouldContinue({ passed: 5, iter: 10, max_iter: 10 });
  assert.equal(r.decision, 'stop');
  assert.equal(r.reason, 'max-iter');
});

test('stops when iter > max_iter (safety)', () => {
  const r = shouldContinue({ passed: 5, iter: 11, max_iter: 10 });
  assert.equal(r.decision, 'stop');
  assert.equal(r.reason, 'max-iter');
});

test('accepts applied alias for passed', () => {
  const r = shouldContinue({ applied: 3, iter: 2, max_iter: 10 });
  assert.equal(r.decision, 'continue');
});

test('accepts applied === 0 as stop', () => {
  const r = shouldContinue({ applied: 0, iter: 2, max_iter: 10 });
  assert.equal(r.decision, 'stop');
  assert.equal(r.reason, 'no-passed');
});

test('throws when neither passed nor applied given', () => {
  assert.throws(() => shouldContinue({ iter: 2, max_iter: 10 }));
});

test('throws on negative iter', () => {
  assert.throws(() => shouldContinue({ passed: 1, iter: -1, max_iter: 10 }));
});

test('throws on non-positive max_iter', () => {
  assert.throws(() => shouldContinue({ passed: 1, iter: 0, max_iter: 0 }));
});
