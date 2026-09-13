import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, FINAL_REVIEW_MODEL, resolvePreset } from './presets.mjs';

test('transcribe preset resolves to haiku implementer / sonnet reviewer / sonnet escalated', () => {
  assert.deepEqual(resolvePreset('transcribe'), {
    implementer: 'haiku', reviewer: 'sonnet', escalated: 'sonnet',
  });
});

test('standard preset resolves to sonnet implementer / sonnet reviewer / opus escalated', () => {
  assert.deepEqual(resolvePreset('standard'), {
    implementer: 'sonnet', reviewer: 'sonnet', escalated: 'opus',
  });
});

test('design preset resolves to opus for all three roles', () => {
  assert.deepEqual(resolvePreset('design'), {
    implementer: 'opus', reviewer: 'opus', escalated: 'opus',
  });
});

test('unknown preset throws naming the valid presets', () => {
  assert.throws(() => resolvePreset('nope'), /unknown preset: nope.*transcribe.*standard.*design/s);
});

test('resolvePreset returns a copy, not the shared PRESETS entry', () => {
  const r = resolvePreset('standard');
  r.implementer = 'mutated';
  assert.equal(PRESETS.standard.implementer, 'sonnet');
});

test('FINAL_REVIEW_MODEL is opus, outside the preset table', () => {
  assert.equal(FINAL_REVIEW_MODEL, 'opus');
});
