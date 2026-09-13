// workflow.test.mjs
/**
 * workflow.mjs は `export const meta` とトップレベル `return` を同居させているため
 * import できない。code-review-loop-workflow/lib/workflow-branches.test.mjs と同じ
 * 手口で export を1つ剥がし、AsyncFunction の body として評価する。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PRESETS } from './lib/presets.mjs';
import * as branches from './lib/task-branches.mjs';

const WF = join(dirname(fileURLToPath(import.meta.url)), 'workflow.mjs');
const SRC = readFileSync(WF, 'utf8').replace(/^export const meta/, 'const meta');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', SRC);

test('生成ブロックの presets は lib/presets.mjs と一致する', () => {
  const m = SRC.match(/--- presets \(generated[\s\S]*?\n([\s\S]*?)\n\/\/ --- end presets ---/);
  assert.ok(m, 'presets の生成ブロックが見つからない');
  const evalPresets = new Function(`${m[1]}\nreturn { PRESETS, FINAL_REVIEW_MODEL, resolvePreset };`)();
  assert.deepEqual(evalPresets.PRESETS, PRESETS);
  assert.equal(evalPresets.resolvePreset('standard').reviewer, 'sonnet');
});

const TASK_BRANCHES_BLOCK = () => {
  const m = SRC.match(/--- task-branches \(generated[\s\S]*?\n([\s\S]*?)\n\/\/ --- end task-branches ---/);
  assert.ok(m, 'task-branches の生成ブロックが見つからない');
  return m[1];
};

// lib/task-branches.mjs に定義された全関数（export されていない section/subsection/
// bullets も含む）。生成ブロックはこれと1関数も欠けずに一致しなければならない。
const TASK_BRANCHES_FNS = [
  'section', 'subsection', 'bullets',
  'parseTaskReview', 'parseReReview', 'parseFinalReview', 'assignRefs',
  'routeAfterReview', 'routeAfterReReview', 'routeFinalReview',
  'guardFixApplied', 'buildLedgerLine',
];

/** src から `function NAME(...) { ... }` の本体を丸ごと切り出す */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} が見つからない`);
  let i = src.indexOf('(', start);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  const bodyStart = src.indexOf('{', i);
  assert.ok(bodyStart >= 0, `${name} の本体開始 { が見つからない`);
  let depth = 0;
  for (let j = bodyStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${name}: 波括弧が閉じていない`);
}

const LIB_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib', 'task-branches.mjs'), 'utf8');

test('生成ブロックの task-branches は lib の全関数とソース一致する', () => {
  const block = TASK_BRANCHES_BLOCK();
  const norm = (s) => s.replace(/\s+/g, '');
  for (const name of TASK_BRANCHES_FNS) {
    assert.equal(
      norm(extractFn(block, name)),
      norm(extractFn(LIB_SRC, name)),
      `${name} が lib/task-branches.mjs と乖離している（workflow.mjs の生成ブロックを貼り直すこと）`,
    );
  }
});

test('生成ブロックの task-branches は lib の export 関数すべてと機能一致する', () => {
  const exported = TASK_BRANCHES_FNS.filter((n) => !['section', 'subsection', 'bullets'].includes(n));
  const evalBranches = new Function(`${TASK_BRANCHES_BLOCK()}\nreturn { ${exported.join(', ')} };`)();
  for (const name of exported) {
    assert.equal(typeof evalBranches[name], 'function', `${name} が生成ブロックに無い`);
    assert.equal(typeof branches[name], 'function', `${name} が lib から export されていない`);
  }

  const taskInput = '### Spec Compliance\n\n- ❌ Issues found: spec gap here\n- ⚠️ Cannot verify from diff: config.yaml\n\n### Issues\n\n#### Critical (Must Fix)\n- boom\n\n#### Important (Should Fix)\n- meh\n\n#### Minor (Nice to Have)\n- nit\n\n### Assessment\n\n**Task quality:** Needs fixes\n\n**Reasoning:** x\n\n**Plan-mandated findings:** pm item\n';
  const taskParsed = branches.parseTaskReview(taskInput);
  assert.deepEqual(evalBranches.parseTaskReview(taskInput), taskParsed);

  const refs = branches.assignRefs({ critical: taskParsed.criticalItems, important: taskParsed.importantItems, minor: taskParsed.minorItems });
  assert.deepEqual(evalBranches.assignRefs({ critical: taskParsed.criticalItems, important: taskParsed.importantItems, minor: taskParsed.minorItems }), refs);

  const rulings = [{ text: 'pm item', governs: 'finding' }];
  for (const opts of [{ round: 1 }, { round: 1, rulings }, { round: 5, maxRound: 5, rulings }]) {
    assert.deepEqual(evalBranches.routeAfterReview(taskParsed, refs, opts), branches.routeAfterReview(taskParsed, refs, opts));
  }

  const reInput = '### Finding Verdicts\n\n- **boom** — NOT ADDRESSED (src/x.js:1)\n- **meh** — ADDRESSED (src/x.js:2)\n\n### New Breakage in the Fix Diff\n\n- regression (Minor) (src/y.js:3)\n\n### Out-of-Scope Observations\n\n- stale comment\n\n### Verdict\n\n**Fix round:** Findings remain open — boom\n';
  const reParsed = branches.parseReReview(reInput);
  assert.deepEqual(evalBranches.parseReReview(reInput), reParsed);
  for (const opts of [{ round: 1, maxRound: 5 }, { round: 5, maxRound: 5 }]) {
    assert.deepEqual(evalBranches.routeAfterReReview(reParsed, opts), branches.routeAfterReReview(reParsed, opts));
  }

  const finalSampleInput = '### Issues\n\n#### Critical (Must Fix)\n\n#### Important (Should Fix)\n- missing help text\n\n#### Minor (Nice to Have)\n\n### Assessment\n\n**Ready to merge?** With fixes\n\n**Reasoning:** x\n';
  const finalSample = branches.parseFinalReview(finalSampleInput);
  assert.deepEqual(evalBranches.parseFinalReview(finalSampleInput), finalSample);

  const finalRefsSample = branches.assignRefs({ critical: finalSample.criticalItems, important: finalSample.importantItems, minor: finalSample.minorItems });
  assert.deepEqual(evalBranches.routeFinalReview(finalSample, finalRefsSample), branches.routeFinalReview(finalSample, finalRefsSample));

  for (const round of [1, 2, 3]) {
    assert.deepEqual(evalBranches.guardFixApplied('## Fix Round 1\nx', round), branches.guardFixApplied('## Fix Round 1\nx', round));
  }

  const ledgerCases = [
    { taskN: 1, status: 'complete', baseSha: 'abc1234xxx', headSha: 'def5678xxx', unverifiableCount: 2, parkedCount: 1 },
    { taskN: 1, status: 'fix_required', baseSha: 'abc1234xxx', headSha: 'def5678xxx', round: 2, openFindings: [{ ref: 'C-1', text: 'bug' }] },
    { taskN: 1, status: 'capped', round: 5, residualFindings: ['x'] },
    { taskN: 1, status: 'plan_conflict', openFindings: ['pm'] },
    { taskN: 'final', status: 'review_failed' },
    { taskN: 1, status: 'fix_not_applied', round: 3 },
  ];
  for (const c of ledgerCases) {
    assert.equal(evalBranches.buildLedgerLine(c), branches.buildLedgerLine(c), `buildLedgerLine が乖離: ${c.status}`);
  }
  assert.throws(() => evalBranches.buildLedgerLine({ taskN: 1, status: 'nope' }), /unknown status/);
});

function harness(reviewTextByCall) {
  const calls = [];
  const prompts = [];
  const agent = async (prompt, opts = {}) => {
    calls.push(opts.label ?? '(none)');
    prompts.push(prompt);
    const key = calls.length - 1;
    if (opts.label === 'review') return reviewTextByCall[key] ?? reviewTextByCall.review;
    if (opts.label === 're-review') return reviewTextByCall['re-review'];
    throw new Error(`unexpected agent label: ${opts.label}`);
  };
  return {
    calls,
    prompts,
    invoke: (a) => run(a, agent, async (t) => Promise.all(t.map((f) => f())),
      async () => { throw new Error('pipeline not used'); }, () => {}, () => {}, { total: null }),
  };
}

const BASE_ARGS = {
  skillDir: '/skill', planFile: '/w/plan.md', workspaceDir: '/w', briefPath: '/w/task-1-brief.md',
  constraintsPath: '/w/task-1-constraints.md', reportPath: '/w/task-1-report.md',
  base: 'aaaaaaaaaaaa', head: 'bbbbbbbbbbbb', taskN: 1, preset: 'standard', startRound: 1,
};

const CLEAN = '### Spec Compliance\n\n- ✅ Spec compliant\n\n### Issues\n\n#### Critical (Must Fix)\n\n#### Important (Should Fix)\n\n#### Minor (Nice to Have)\n\n### Assessment\n\n**Task quality:** Approved\n\n**Reasoning:** ok\n\n**Plan-mandated findings:** none\n';

test('mode:task ラウンド1・クリーンなレビューは complete を返す', async () => {
  const h = harness({ review: CLEAN });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.status, 'complete');
  assert.match(r.ledgerLine, /Task 1: complete/);
});

test('mode:task startRound>=2 で前ラウンドの fix report が無ければ review を呼ばず fix_not_applied', async () => {
  const h = harness({});
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 2, fixBase: 'cccccccccccc' });
  assert.equal(r.status, 'fix_not_applied');
  assert.deepEqual(h.calls, []);
});

const ISSUES = '### Spec Compliance\n\n- ❌ Issues found: gap\n\n### Issues\n\n#### Critical (Must Fix)\n- bug here\n\n#### Important (Should Fix)\n\n#### Minor (Nice to Have)\n\n### Assessment\n\n**Task quality:** Needs fixes\n\n**Reasoning:** x\n\n**Plan-mandated findings:** none\n';

test('mode:task 指摘ありは fix_required、round<=3 は nextFixMode=resume', async () => {
  const h = harness({ review: ISSUES });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.status, 'fix_required');
  assert.equal(r.nextFixMode, 'resume');
  assert.equal(r.openFindings.length, 1);
});

const REREVIEW_ISSUES = '### Finding Verdicts\n\n- **bug here** — NOT ADDRESSED (still present)\n\n### New Breakage in the Fix Diff\n\nNone\n\n### Out-of-Scope Observations\n\nNone\n\n### Verdict\n\n**Fix round:** Findings remain open — bug here\n';

test('mode:task round4 の fix_required は nextFixMode=fresh', async () => {
  // round >= 2 は再レビュー（isRereview）なので、harness には re-review 形式の
  // フィクスチャを 're-review' キーで渡す。review 形式のテキストを渡すと
  // parseReReview がパースできず review_failed になり、nextFixMode を検証できない。
  const h = harness({ 're-review': REREVIEW_ISSUES });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 4, fixBase: 'cccccccccccc', reportText: '## Fix Round 3\nx' });
  assert.equal(r.nextFixMode, 'fresh');
});

test('mode:task round5 で指摘が残れば capped', async () => {
  const h = harness({ 're-review': REREVIEW_ISSUES });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 5, fixBase: 'cccccccccccc', reportText: '## Fix Round 4\nx' });
  assert.equal(r.status, 'capped');
});

const PLAN_MANDATED = ISSUES.replace('**Plan-mandated findings:** none', '**Plan-mandated findings:** verbatim duplication mandated by plan');

test('mode:task plan-mandated 指摘は即 plan_conflict', async () => {
  const h = harness({ review: PLAN_MANDATED });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.status, 'plan_conflict');
});

test('mode:task レビュアーが2回連続でパース不能を返せば review_failed', async () => {
  const h = harness({ review: 'garbage, no decision lines at all' });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.status, 'review_failed');
  assert.equal(h.calls.filter((c) => c === 'review').length, 2, '同一モデルで1回だけリトライする');
});

const FINAL_CLEAN = '### Issues\n\n#### Critical (Must Fix)\n\n#### Important (Should Fix)\n\n#### Minor (Nice to Have)\n\n### Assessment\n\n**Ready to merge?** Yes\n\n**Reasoning:** ok\n';
const FINAL_ISSUES = '### Issues\n\n#### Critical (Must Fix)\n\n#### Important (Should Fix)\n- missing help text\n\n#### Minor (Nice to Have)\n\n### Assessment\n\n**Ready to merge?** With fixes\n\n**Reasoning:** x\n';

function finalHarness(script) {
  // label の値は通常「1回だけ呼ばれる想定」の1つの文字列。リトライ挙動をテストする
  // ときだけ配列を渡し、同じ label への呼び出しごとに配列を先頭から1つずつ消費する
  // （最後の要素を使い切ったら以降はそれを使い回す）。文字列に対して `?.[i++]` を
  // 使うと1文字だけ切り出されてしまう（文字列の添字アクセスは truthy な1文字を
  // 返すため `??` のフォールバックが効かない）ので、配列かどうかで分岐する。
  const calls = [];
  const prompts = [];
  const callCounts = {};
  const agent = async (prompt, opts = {}) => {
    calls.push(opts.label);
    prompts.push(prompt);
    const value = script[opts.label];
    if (Array.isArray(value)) {
      const i = callCounts[opts.label] ?? 0;
      callCounts[opts.label] = i + 1;
      return value[Math.min(i, value.length - 1)];
    }
    return value;
  };
  return {
    calls,
    prompts,
    invoke: (a) => run(a, agent, async (t) => Promise.all(t.map((f) => f())),
      async () => { throw new Error('pipeline not used'); }, () => {}, () => {}, { total: null }),
  };
}

const FINAL_ARGS = {
  skillDir: '/skill', planFile: '/w/plan.md', workspaceDir: '/w',
  mergeBase: 'aaaaaaaaaaaa', head: 'bbbbbbbbbbbb',
};
// fixer は **New HEAD:** 行を必須で返す（返さないと Verify の HEAD が決まらない）
const FIX_DONE = '**Status:** DONE\n- Commits created: deadbee fix stuff\n- **New HEAD:** deadbee1234567\n';

test('mode:final 指摘ゼロは clean を返し fixer を呼ばない', async () => {
  const h = finalHarness({ 'final-review': FINAL_CLEAN });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'clean');
  assert.deepEqual(h.calls, ['final-review']);
});

test('mode:final 指摘ありは fixer を1回だけ呼び、再レビュー後の残余を返す', async () => {
  const h = finalHarness({
    'final-review': FINAL_ISSUES,
    'final-fix': FIX_DONE,
    're-review': '### Finding Verdicts\n\n- **missing help text** — ADDRESSED (index.js:1)\n\n### New Breakage in the Fix Diff\n\nNone\n\n### Out-of-Scope Observations\n\nNone\n\n### Verdict\n\n**Fix round:** All findings addressed, no new Critical/Important breakage\n',
  });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'clean');
  assert.deepEqual(h.calls, ['final-review', 'final-fix', 're-review']);
});

test('mode:final 再レビューで指摘が残れば residual として返し、2周目は起きない', async () => {
  const h = finalHarness({
    'final-review': FINAL_ISSUES,
    'final-fix': FIX_DONE + '- Could not fix one item\n',
    're-review': '### Finding Verdicts\n\n- **missing help text** — NOT ADDRESSED (index.js:1)\n\n### New Breakage in the Fix Diff\n\nNone\n\n### Out-of-Scope Observations\n\nNone\n\n### Verdict\n\n**Fix round:** Findings remain open — missing help text\n',
  });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'residual');
  assert.equal(r.residualFindings.length, 1);
  assert.deepEqual(h.calls, ['final-review', 'final-fix', 're-review']);
});

const FINAL_GARBAGE = 'garbage, no decision lines at all';
const RE_REVIEW_CLEAN = '### Finding Verdicts\n\n- **missing help text** — ADDRESSED (index.js:1)\n\n### New Breakage in the Fix Diff\n\nNone\n\n### Out-of-Scope Observations\n\nNone\n\n### Verdict\n\n**Fix round:** All findings addressed, no new Critical/Important breakage\n';

test('mode:final final-review のパース失敗は同一モデルで1回だけリトライし、成功すれば続行する', async () => {
  const h = finalHarness({ 'final-review': [FINAL_GARBAGE, FINAL_CLEAN] });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'clean');
  assert.equal(h.calls.filter((c) => c === 'final-review').length, 2, '同一モデルで1回だけリトライする');
});

test('mode:final final-review が2回連続でパース不能なら review_failed（3回目は呼ばない）', async () => {
  const h = finalHarness({ 'final-review': FINAL_GARBAGE });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'review_failed');
  assert.equal(h.calls.filter((c) => c === 'final-review').length, 2, '3回目のリトライやモデルエスカレーションは起きない');
});

test('mode:final re-review のパース失敗は同一モデルで1回だけリトライし、成功すれば続行する', async () => {
  const h = finalHarness({
    'final-review': FINAL_ISSUES,
    'final-fix': FIX_DONE,
    're-review': [FINAL_GARBAGE, RE_REVIEW_CLEAN],
  });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'clean');
  assert.equal(h.calls.filter((c) => c === 're-review').length, 2, '同一モデルで1回だけリトライする');
});

test('mode:final re-review が2回連続でパース不能なら review_failed（3回目は呼ばない）', async () => {
  const h = finalHarness({
    'final-review': FINAL_ISSUES,
    'final-fix': FIX_DONE,
    're-review': FINAL_GARBAGE,
  });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'review_failed');
  assert.equal(h.calls.filter((c) => c === 're-review').length, 2, '3回目のリトライやモデルエスカレーションは起きない');
});

// --- Critical 1: 最終レビューは plan を必須で見る ---

test('mode:final は planFile を必須にする', async () => {
  const { planFile, ...noPlan } = FINAL_ARGS;
  const h = finalHarness({ 'final-review': FINAL_CLEAN });
  await assert.rejects(() => h.invoke({ ...noPlan, mode: 'final' }), /missing required key: planFile/);
});

test('mode:final のレビュー dispatch プロンプトは plan を読ませる', async () => {
  const h = finalHarness({ 'final-review': FINAL_CLEAN });
  await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.match(h.prompts[0], /\/w\/plan\.md/);
  assert.match(h.prompts[0], /Plan \/ requirements/);
});

// --- Critical 2: review-package は常に明示 OUTFILE 付きで呼ばせる ---

test('mode:task round1 の review dispatch は review-package を明示 OUTFILE 付きで必ず実行させる', async () => {
  const h = harness({ review: CLEAN });
  await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.match(
    h.prompts[0],
    /\/skill\/scripts\/review-package \/w\/plan\.md aaaaaaaaaaaa bbbbbbbbbbbb \/w\/review-aaaaaaa\.\.bbbbbbb\.diff/,
  );
  assert.doesNotMatch(h.prompts[0], /does not exist/, '「無ければ」の条件付き実行は残っていてはならない');
});

const REREVIEW_TASK_CLEAN = '### Finding Verdicts\n\n- **bug here** — ADDRESSED (src/x.js:1)\n\n### New Breakage in the Fix Diff\n\nNone\n\n### Out-of-Scope Observations\n\nNone\n\n### Verdict\n\n**Fix round:** All findings addressed, no new Critical/Important breakage\n';

test('mode:task re-review dispatch も review-package を明示 OUTFILE 付きで実行させる', async () => {
  const h = harness({ 're-review': REREVIEW_TASK_CLEAN });
  await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 2, fixBase: 'cccccccccccc', reportText: '## Fix Round 1\nx' });
  assert.match(
    h.prompts[0],
    /\/skill\/scripts\/review-package \/w\/plan\.md cccccccccccc bbbbbbbbbbbb \/w\/review-ccccccc\.\.bbbbbbb\.diff/,
  );
});

test('mode:final の review dispatch は review-package を明示 OUTFILE 付きで実行させる', async () => {
  const h = finalHarness({ 'final-review': FINAL_CLEAN });
  await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.match(
    h.prompts[0],
    /\/skill\/scripts\/review-package \/w\/plan\.md aaaaaaaaaaaa bbbbbbbbbbbb \/w\/review-final-aaaaaaa\.\.bbbbbbb\.diff/,
  );
  assert.doesNotMatch(h.prompts[0], /does not exist/);
});

// --- I-1: base（タスク不変）と fixBase（周回スコープ）の分離 ---

test('mode:task round>=2 は fixBase を必須にする', async () => {
  const h = harness({});
  await assert.rejects(
    () => h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 2, reportText: '## Fix Round 1\nx' }),
    /missing required key: fixBase/,
  );
});

test('mode:task round1 は fixBase を要求しない', async () => {
  const h = harness({ review: CLEAN });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.status, 'complete');
});

test('mode:task round>=2 の diff は fixBase..head、ledger の complete は base..head を使う', async () => {
  const h = harness({ 're-review': REREVIEW_TASK_CLEAN });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 2, fixBase: 'cccccccccccc', reportText: '## Fix Round 1\nx' });
  assert.equal(r.status, 'complete');
  assert.match(h.prompts[0], /FIX_BASE=cccccccccccc HEAD=bbbbbbbbbbbb/);
  assert.match(h.prompts[0], /\/w\/review-ccccccc\.\.bbbbbbb\.diff/);
  assert.match(r.ledgerLine, /commits aaaaaaa\.\.bbbbbbb/, 'ledger はタスク全体の base..head を使う');
});

// --- I-2: task モードのレビュアーに reviewFile への書き出しを指示する ---

test('mode:task の review dispatch は reviewFile への書き出しを指示する', async () => {
  const h = harness({ review: CLEAN });
  const r = await h.invoke({ ...BASE_ARGS, mode: 'task' });
  assert.equal(r.reviewFile, '/w/task-1-review-R1.md');
  assert.match(h.prompts[0], /\/w\/task-1-review-R1\.md/);
});

test('mode:task の re-review dispatch も reviewFile への書き出しを指示する', async () => {
  const h = harness({ 're-review': REREVIEW_TASK_CLEAN });
  await h.invoke({ ...BASE_ARGS, mode: 'task', startRound: 2, fixBase: 'cccccccccccc', reportText: '## Fix Round 1\nx' });
  assert.match(h.prompts[0], /\/w\/task-1-review-R2\.md/);
});

// --- I-3 / Critical 3: rulings を workflow が routeAfterReview に渡す ---

test('mode:task rulings を渡すと plan_conflict を抜けて fix_required に進む', async () => {
  const h = harness({ review: PLAN_MANDATED });
  const r = await h.invoke({
    ...BASE_ARGS, mode: 'task',
    rulings: [{ text: 'verbatim duplication mandated by plan', governs: 'finding' }],
  });
  assert.equal(r.status, 'fix_required');
  assert.ok(r.openFindings.some((f) => f.ref === 'PM-1'), JSON.stringify(r.openFindings));
});

test('mode:task governs:plan の ruling を渡すと plan-mandated 指摘は waive される', async () => {
  const h = harness({ review: PLAN_MANDATED });
  const r = await h.invoke({
    ...BASE_ARGS, mode: 'task',
    rulings: [{ text: 'verbatim duplication mandated by plan', governs: 'plan' }],
  });
  assert.notEqual(r.status, 'plan_conflict');
});

// --- I-5: fixer の New HEAD を Verify に引き渡す ---

test('mode:final fixer が New HEAD を返さなければ review_failed（再レビューは呼ばない）', async () => {
  const h = finalHarness({ 'final-review': FINAL_ISSUES, 'final-fix': '**Status:** DONE\n- commits: deadbee\n' });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'review_failed');
  assert.deepEqual(h.calls, ['final-review', 'final-fix']);
});

test('mode:final fixer の New HEAD が Verify の HEAD と fix diff 生成に使われる', async () => {
  const h = finalHarness({ 'final-review': FINAL_ISSUES, 'final-fix': FIX_DONE, 're-review': RE_REVIEW_CLEAN });
  const r = await h.invoke({ ...FINAL_ARGS, mode: 'final' });
  assert.equal(r.status, 'clean');
  const p = h.prompts[2];
  assert.doesNotMatch(p, /<new head>/, '未置換のプレースホルダが残っている');
  assert.match(p, /FIX_BASE=bbbbbbbbbbbb HEAD=deadbee1234567/);
  assert.match(
    p,
    /\/skill\/scripts\/review-package \/w\/plan\.md bbbbbbbbbbbb deadbee1234567 \/w\/review-final-fix\.diff/,
  );
});
