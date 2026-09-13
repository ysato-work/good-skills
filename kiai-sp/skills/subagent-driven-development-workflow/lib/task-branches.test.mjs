// lib/task-branches.test.mjs (このタスクで書く分)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskReview, parseReReview, parseFinalReview, assignRefs } from './task-branches.mjs';

const CLEAN_REVIEW = `
### Spec Compliance

- ✅ Spec compliant

### Strengths
- Good test coverage

### Issues

#### Critical (Must Fix)

#### Important (Should Fix)

#### Minor (Nice to Have)
- Consider renaming the helper

### Assessment

**Task quality:** Approved

**Reasoning:** Clean, matches the brief.

**Plan-mandated findings:** none
`;

test('parseTaskReview: spec 準拠・指摘なしのクリーンな結果', () => {
  const r = parseTaskReview(CLEAN_REVIEW);
  assert.equal(r.specCompliant, true);
  assert.deepEqual(r.criticalItems, []);
  assert.deepEqual(r.importantItems, []);
  assert.deepEqual(r.minorItems, ['Consider renaming the helper']);
  assert.equal(r.taskQuality, 'approved');
  assert.deepEqual(r.planMandatedItems, []);
  assert.deepEqual(r.parseErrors, []);
});

const ISSUES_REVIEW = `
### Spec Compliance

- ❌ Issues found: missing progress reporting (src/x.js:10)
- ⚠️ Cannot verify from diff: whether config.yaml also needs the flag

### Issues

#### Critical (Must Fix)
- Swallowed error in catch block (src/x.js:22)

#### Important (Should Fix)
- Magic number 100 should be a named constant (src/x.js:7)
- Test asserts nothing (test/x.test.js:5)

#### Minor (Nice to Have)

### Assessment

**Task quality:** Needs fixes

**Reasoning:** Spec gap and a swallowed error.

**Plan-mandated findings:** Test asserts nothing (test/x.test.js:5)
`;

test('parseTaskReview: 指摘ありのケースを全項目パースする', () => {
  const r = parseTaskReview(ISSUES_REVIEW);
  assert.equal(r.specCompliant, false);
  assert.match(r.cannotVerifyText, /config\.yaml/);
  assert.deepEqual(r.criticalItems, ['Swallowed error in catch block (src/x.js:22)']);
  assert.equal(r.importantItems.length, 2);
  assert.equal(r.taskQuality, 'needs_fixes');
  assert.deepEqual(r.planMandatedItems, ['Test asserts nothing (test/x.test.js:5)']);
});

test('parseTaskReview 異常系: Spec Compliance の決め行が欠落', () => {
  const r = parseTaskReview(ISSUES_REVIEW.replace(/- ❌ Issues found:.*\n/, ''));
  assert.equal(r.specCompliant, null);
  assert.ok(r.parseErrors.some((e) => /Spec Compliance/.test(e)));
});

test('parseTaskReview 異常系: 絵文字が欠落していても大文字小文字を無視して拾う', () => {
  const noEmoji = CLEAN_REVIEW.replace('✅ Spec compliant', 'spec COMPLIANT');
  const r = parseTaskReview(noEmoji);
  assert.equal(r.specCompliant, true);
});

test('parseTaskReview 異常系: Task quality の括弧内注記が揺れていても拾う', () => {
  const withNote = CLEAN_REVIEW.replace(
    '**Task quality:** Approved',
    '**Task quality:** Approved (minor style nit noted separately)',
  );
  const r = parseTaskReview(withNote);
  assert.equal(r.taskQuality, 'approved');
});

test('parseTaskReview 異常系: Plan-mandated findings 行そのものが無い', () => {
  const noLine = CLEAN_REVIEW.replace(/\*\*Plan-mandated findings:\*\* none\n/, '');
  const r = parseTaskReview(noLine);
  assert.equal(r.planMandatedText, null);
  assert.ok(r.parseErrors.some((e) => /Plan-mandated/.test(e)));
});

const REREVIEW_CLEAN = `
### Finding Verdicts

- **Swallowed error in catch block** — ADDRESSED (src/x.js:22)
- **Magic number 100** — ADDRESSED (src/x.js:7)

### New Breakage in the Fix Diff

None

### Out-of-Scope Observations

None

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage
`;

test('parseReReview: 全件 ADDRESSED でクリーン', () => {
  const r = parseReReview(REREVIEW_CLEAN);
  assert.equal(r.verdicts.length, 2);
  assert.ok(r.verdicts.every((v) => v.status === 'addressed'));
  assert.deepEqual(r.newBreakage, []);
  assert.deepEqual(r.outOfScope, []);
  assert.equal(r.fixRoundComplete, true);
});

const REREVIEW_OPEN = `
### Finding Verdicts

- **Swallowed error in catch block** — NOT ADDRESSED (still present at src/x.js:22)

### New Breakage in the Fix Diff

- New null-deref risk introduced by the fix (Critical) (src/x.js:30)

### Out-of-Scope Observations

- Unrelated file src/y.js has a stale comment

### Verdict

**Fix round:** Findings remain open — Swallowed error in catch block
`;

test('parseReReview: NOT ADDRESSED と新規 breakage を拾う', () => {
  const r = parseReReview(REREVIEW_OPEN);
  assert.equal(r.verdicts[0].status, 'not_addressed');
  assert.equal(r.newBreakage[0].severity, 'critical');
  assert.equal(r.outOfScope.length, 1);
  assert.equal(r.fixRoundComplete, false);
});

const FINAL_REVIEW = `
### Strengths
- Solid architecture

### Issues

#### Critical (Must Fix)

#### Important (Should Fix)
- Missing help text (index.js:1)

#### Minor (Nice to Have)
- Progress indicator missing (indexer.js:130)

### Recommendations
- Add progress reporting

### Assessment

**Ready to merge?** With fixes

**Reasoning:** Solid core, easy fixes remain.
`;

test('parseFinalReview: code-reviewer.md のフォーマットをパースする', () => {
  const r = parseFinalReview(FINAL_REVIEW);
  assert.deepEqual(r.criticalItems, []);
  assert.equal(r.importantItems.length, 1);
  assert.equal(r.minorItems.length, 1);
  assert.equal(r.readyToMerge, 'with_fixes');
  assert.deepEqual(r.parseErrors, []);
});

test('assignRefs: severity ごとに 1 始まりで採番する', () => {
  const refs = assignRefs({ critical: ['a', 'b'], important: ['c'], minor: [] });
  assert.deepEqual(refs.critical.map((r) => r.ref), ['C-1', 'C-2']);
  assert.deepEqual(refs.important.map((r) => r.ref), ['I-1']);
  assert.deepEqual(refs.minor, []);
});

// Task 3: Routing functions
import { routeAfterReview, routeAfterReReview, routeFinalReview, guardFixApplied, buildLedgerLine } from './task-branches.mjs';

test('routeAfterReview: plan-mandated 指摘は spec 準拠でも即 plan_conflict', () => {
  const parsed = { specCompliant: true, planMandatedItems: ['x'] };
  const refs = { critical: [], important: [], minor: [] };
  const r = routeAfterReview(parsed, refs, { round: 1 });
  assert.equal(r.status, 'plan_conflict');
  assert.deepEqual(r.planMandated, ['x']);
});

test('routeAfterReview: spec 準拠かつ Critical/Important 0 は complete', () => {
  const parsed = { specCompliant: true, planMandatedItems: [] };
  const refs = { critical: [], important: [], minor: [{ ref: 'M-1', text: 'nit' }] };
  const r = routeAfterReview(parsed, refs, { round: 1 });
  assert.equal(r.status, 'complete');
  assert.deepEqual(r.deferredMinors, ['nit']);
});

test('routeAfterReview: round < 5 で指摘が残れば fix_required', () => {
  const parsed = { specCompliant: false, planMandatedItems: [] };
  const refs = { critical: [{ ref: 'C-1', text: 'bug' }], important: [], minor: [] };
  const r = routeAfterReview(parsed, refs, { round: 2, maxRound: 5 });
  assert.equal(r.status, 'fix_required');
  assert.deepEqual(r.openFindings, [{ ref: 'C-1', text: 'bug' }]);
});

test('routeAfterReview: round 5 で指摘が残れば capped', () => {
  const parsed = { specCompliant: false, planMandatedItems: [] };
  const refs = { critical: [{ ref: 'C-1', text: 'bug' }], important: [], minor: [] };
  const r = routeAfterReview(parsed, refs, { round: 5, maxRound: 5 });
  assert.equal(r.status, 'capped');
  assert.deepEqual(r.residualFindings, [{ ref: 'C-1', text: 'bug' }]);
});

test('routeAfterReReview: 全件 addressed かつ breakage 無しは complete', () => {
  const parsed = { verdicts: [{ text: 'a', status: 'addressed' }], newBreakage: [], outOfScope: ['obs'], fixRoundComplete: true };
  const r = routeAfterReReview(parsed, { round: 1 });
  assert.equal(r.status, 'complete');
  assert.deepEqual(r.deferredMinors, ['obs']);
});

test('routeAfterReReview: NOT ADDRESSED が残れば fix_required（round < max）', () => {
  const parsed = { verdicts: [{ text: 'a', status: 'not_addressed' }], newBreakage: [], outOfScope: [], fixRoundComplete: false };
  const r = routeAfterReReview(parsed, { round: 2, maxRound: 5 });
  assert.equal(r.status, 'fix_required');
  assert.deepEqual(r.openFindings, ['a']);
});

test('routeAfterReReview: round 5 で残れば capped', () => {
  const parsed = { verdicts: [{ text: 'a', status: 'not_addressed' }], newBreakage: [], outOfScope: [], fixRoundComplete: false };
  const r = routeAfterReReview(parsed, { round: 5, maxRound: 5 });
  assert.equal(r.status, 'capped');
});

test('routeAfterReReview: 新規 Critical breakage は open に合流する', () => {
  const parsed = {
    verdicts: [{ text: 'a', status: 'addressed' }],
    newBreakage: [{ severity: 'critical', text: 'new bug' }],
    outOfScope: [], fixRoundComplete: true,
  };
  const r = routeAfterReReview(parsed, { round: 1, maxRound: 5 });
  assert.equal(r.status, 'fix_required');
  assert.deepEqual(r.openFindings, ['new bug']);
});

test('routeFinalReview: 指摘ゼロは clean', () => {
  const parsed = { criticalItems: [], importantItems: [], minorItems: ['nit'] };
  const refs = { critical: [], important: [], minor: [{ ref: 'M-1', text: 'nit' }] };
  const r = routeFinalReview(parsed, refs);
  assert.equal(r.status, 'clean');
  assert.deepEqual(r.openFindings, []);
});

test('routeFinalReview: Critical/Important があれば has_findings', () => {
  const parsed = { criticalItems: [], importantItems: ['gap'], minorItems: [] };
  const refs = { critical: [], important: [{ ref: 'I-1', text: 'gap' }], minor: [] };
  const r = routeFinalReview(parsed, refs);
  assert.equal(r.status, 'has_findings');
  assert.deepEqual(r.openFindings, [{ ref: 'I-1', text: 'gap' }]);
});

test('guardFixApplied: round 1 はガード対象外', () => {
  assert.deepEqual(guardFixApplied('anything', 1), { ok: true });
});

test('guardFixApplied: 前ラウンドの Fix Round 見出しが無ければ NG', () => {
  const r = guardFixApplied('## Fix Round 1\nfixed stuff', 3);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Fix Round 2/);
});

test('guardFixApplied: 前ラウンドの見出しがあれば OK', () => {
  const r = guardFixApplied('## Fix Round 1\nfixed a\n## Fix Round 2\nfixed b', 3);
  assert.equal(r.ok, true);
});

test('buildLedgerLine: complete（unverifiable 解決件数を埋め込む）', () => {
  const line = buildLedgerLine({
    taskN: 3, status: 'complete', baseSha: 'abc1234xxxx', headSha: 'def5678xxxx', unverifiableCount: 2,
  });
  assert.equal(line, 'Task 3: complete (commits abc1234..def5678, review clean, unverifiable 2 resolved)');
});

test('buildLedgerLine: fix_required の周回行', () => {
  const line = buildLedgerLine({
    taskN: 3, status: 'fix_required', baseSha: 'abc1234xxxx', headSha: 'def5678xxxx',
    round: 1, openFindings: [{ ref: 'C-1', text: 'bug' }],
  });
  assert.equal(line, 'Task 3: fix round 1/5 (1 open — bug; commits abc1234..def5678)');
});

test('buildLedgerLine: capped の残余行', () => {
  const line = buildLedgerLine({
    taskN: 3, status: 'capped', round: 5, residualFindings: [{ ref: 'C-1', text: 'bug' }],
  });
  assert.equal(line, 'Task 3: capped at round 5/5 (1 residual — bug)');
});

test('buildLedgerLine: 未知 status は throw', () => {
  assert.throws(() => buildLedgerLine({ taskN: 1, status: 'nope' }), /unknown status/);
});

// --- Critical 3: plan_conflict の脱出路（rulings） ---

const NO_REFS = () => ({ critical: [], important: [], minor: [] });

test('routeAfterReview: governs:plan の ruling がある plan-mandated 項目は waive される', () => {
  const parsed = { specCompliant: true, planMandatedItems: ['verbatim duplication mandated by plan'] };
  const r = routeAfterReview(parsed, NO_REFS(), {
    round: 1, rulings: [{ text: 'verbatim duplication', governs: 'plan' }],
  });
  assert.equal(r.status, 'complete');
});

test('routeAfterReview: governs:finding の ruling がある項目は PM-n として openFindings に昇格する', () => {
  const parsed = { specCompliant: true, planMandatedItems: ['verbatim duplication mandated by plan', 'skip the test'] };
  const r = routeAfterReview(parsed, NO_REFS(), {
    round: 1,
    rulings: [{ text: 'verbatim duplication', governs: 'finding' }, { text: 'skip the test', governs: 'finding' }],
  });
  assert.equal(r.status, 'fix_required');
  assert.deepEqual(r.openFindings, [
    { ref: 'PM-1', text: 'verbatim duplication mandated by plan' },
    { ref: 'PM-2', text: 'skip the test' },
  ]);
});

test('routeAfterReview: ruling が無い項目だけが plan_conflict に残る', () => {
  const parsed = { specCompliant: true, planMandatedItems: ['duplicated fixture text', 'missing null check'] };
  const r = routeAfterReview(parsed, NO_REFS(), {
    round: 1, rulings: [{ text: 'duplicated fixture text', governs: 'plan' }],
  });
  assert.equal(r.status, 'plan_conflict');
  assert.deepEqual(r.planMandated, ['missing null check']);
});

test('routeAfterReview: ruling のマッチは大文字小文字無視・双方向の部分一致', () => {
  // ruling 側が長い（項目が ruling の部分文字列）
  const r1 = routeAfterReview({ specCompliant: true, planMandatedItems: ['Magic number 100'] }, NO_REFS(), {
    round: 1, rulings: [{ text: 'the magic NUMBER 100 is mandated by the plan', governs: 'plan' }],
  });
  assert.equal(r1.status, 'complete');
  // ruling 側が短い（ruling が項目の部分文字列）
  const r2 = routeAfterReview({ specCompliant: true, planMandatedItems: ['Magic number 100 in src/x.js'] }, NO_REFS(), {
    round: 1, rulings: [{ text: 'MAGIC NUMBER 100', governs: 'plan' }],
  });
  assert.equal(r2.status, 'complete');
  // 無関係な ruling はマッチしない
  const r3 = routeAfterReview({ specCompliant: true, planMandatedItems: ['Magic number 100'] }, NO_REFS(), {
    round: 1, rulings: [{ text: 'unrelated ruling', governs: 'plan' }],
  });
  assert.equal(r3.status, 'plan_conflict');
});

test('routeAfterReview: 昇格した PM 指摘は critical/important の後ろに並ぶ', () => {
  const parsed = { specCompliant: false, planMandatedItems: ['pm item'] };
  const refs = { critical: [{ ref: 'C-1', text: 'bug' }], important: [], minor: [] };
  const r = routeAfterReview(parsed, refs, { round: 1, rulings: [{ text: 'pm item', governs: 'finding' }] });
  assert.deepEqual(r.openFindings, [{ ref: 'C-1', text: 'bug' }, { ref: 'PM-1', text: 'pm item' }]);
});

test('routeAfterReview: governs が plan/finding 以外の ruling は未裁定扱い', () => {
  const r = routeAfterReview({ specCompliant: true, planMandatedItems: ['x'] }, NO_REFS(), {
    round: 1, rulings: [{ text: 'x', governs: 'whatever' }],
  });
  assert.equal(r.status, 'plan_conflict');
  assert.deepEqual(r.planMandated, ['x']);
});

test('routeAfterReview: rulings 未指定なら従来どおり全件 plan_conflict', () => {
  const r = routeAfterReview({ specCompliant: true, planMandatedItems: ['x'] }, NO_REFS(), { round: 1 });
  assert.equal(r.status, 'plan_conflict');
});

// --- I-4: 空の fix_required を作らない ---

test('parseTaskReview: ❌ Issues found の説明文を specGapText として拾う', () => {
  const r = parseTaskReview(ISSUES_REVIEW);
  assert.equal(r.specGapText, 'missing progress reporting (src/x.js:10)');
  assert.match(r.cannotVerifyText, /config\.yaml/);
});

const SPEC_GAP_ONLY = `
### Spec Compliance

- ❌ Issues found: the CLI flag from the brief is missing entirely

### Issues

#### Critical (Must Fix)

#### Important (Should Fix)

#### Minor (Nice to Have)

### Assessment

**Task quality:** Needs fixes

**Reasoning:** spec gap only.

**Plan-mandated findings:** none
`;

test('parseTaskReview: ❌ かつ bullet 無しでも説明文があれば parseErrors に積まない', () => {
  const r = parseTaskReview(SPEC_GAP_ONLY);
  assert.equal(r.specGapText, 'the CLI flag from the brief is missing entirely');
  assert.deepEqual(r.parseErrors, []);
});

test('parseTaskReview: ❌ で bullet も説明文も無ければ parseErrors に積む', () => {
  const r = parseTaskReview(SPEC_GAP_ONLY.replace('- ❌ Issues found: the CLI flag from the brief is missing entirely', '- ❌ Issues found:'));
  assert.equal(r.specGapText, '');
  assert.ok(r.parseErrors.some((e) => /Spec Compliance issue detail/.test(e)), `parseErrors=${JSON.stringify(r.parseErrors)}`);
});

test('routeAfterReview: spec ❌ かつ Critical/Important 0 件なら specGapText を SPEC-1 に合成する', () => {
  const parsed = { specCompliant: false, planMandatedItems: [], specGapText: 'missing progress reporting' };
  const r = routeAfterReview(parsed, NO_REFS(), { round: 1 });
  assert.equal(r.status, 'fix_required');
  assert.deepEqual(r.openFindings, [{ ref: 'SPEC-1', text: 'missing progress reporting' }]);
});

test('routeAfterReview: Critical/Important があるときは specGapText を合成しない', () => {
  const parsed = { specCompliant: false, planMandatedItems: [], specGapText: 'gap' };
  const refs = { critical: [{ ref: 'C-1', text: 'bug' }], important: [], minor: [] };
  const r = routeAfterReview(parsed, refs, { round: 1 });
  assert.deepEqual(r.openFindings, [{ ref: 'C-1', text: 'bug' }]);
});

test('routeAfterReview: 合成した SPEC-1 は capped の残余にも入る', () => {
  const parsed = { specCompliant: false, planMandatedItems: [], specGapText: 'gap' };
  const r = routeAfterReview(parsed, NO_REFS(), { round: 5, maxRound: 5 });
  assert.equal(r.status, 'capped');
  assert.deepEqual(r.residualFindings, [{ ref: 'SPEC-1', text: 'gap' }]);
});
