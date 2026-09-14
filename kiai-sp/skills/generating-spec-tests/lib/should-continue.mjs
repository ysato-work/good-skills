/**
 * 反復ループの終了判定。
 * 決定論式のみを扱い、主観的判定は禁止。
 *
 * 継続: passed(applied) >= 1 かつ iter < max_iter
 * 終了: passed(applied) == 0 または iter >= max_iter
 *
 * @param {{passed?: number, applied?: number, iter: number, max_iter: number}} params
 * @returns {{decision: 'continue'|'stop', reason?: string}}
 */
export function shouldContinue(params) {
  const { passed, applied, iter, max_iter } = params;
  const count = passed ?? applied;
  if (count == null) {
    throw new Error('shouldContinue: passed or applied required');
  }
  if (!Number.isInteger(iter) || iter < 0) {
    throw new Error(`shouldContinue: iter must be non-negative integer, got ${iter}`);
  }
  if (!Number.isInteger(max_iter) || max_iter < 1) {
    throw new Error(`shouldContinue: max_iter must be positive integer, got ${max_iter}`);
  }
  if (count <= 0) return { decision: 'stop', reason: 'no-passed' };
  if (iter >= max_iter) return { decision: 'stop', reason: 'max-iter' };
  return { decision: 'continue' };
}

if (process.argv[1]?.endsWith('should-continue.mjs')) {
  const { readFileSync } = await import('node:fs');
  const [metadataPath] = process.argv.slice(2);
  if (!metadataPath) {
    console.error('Usage: node should-continue.mjs <metadata-iter-N.json>');
    process.exit(2);
  }
  const meta = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const r = shouldContinue({
    passed: meta.passed,
    applied: meta.applied,
    iter: meta.iter,
    max_iter: meta.max_iter,
  });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r.decision === 'continue' ? 0 : 1);
}
