export const meta = {
  name: 'subagent-driven-development-workflow',
  description: 'SDD の per-task レビュー・再レビュー・周回上限・最終 fix wave を JS で強制する。実装者の dispatch と修正の実行は親が持ち、このスキルはレビューと周回管理だけを行う。',
  phases: [
    { title: 'Guard', detail: '前ラウンドの fix report 有無を検証' },
    { title: 'Review', detail: 'タスクレビュー / 再レビュー / 最終レビュー' },
    { title: 'Route', detail: '決め行のパースと status の組み立て' },
  ],
}

// --- presets (generated from lib/presets.mjs — do not edit) ---
const PRESETS = {
  transcribe: { implementer: 'haiku', reviewer: 'sonnet', escalated: 'sonnet' },
  standard: { implementer: 'sonnet', reviewer: 'sonnet', escalated: 'opus' },
  design: { implementer: 'opus', reviewer: 'opus', escalated: 'opus' },
};
const FINAL_REVIEW_MODEL = 'opus';
function resolvePreset(preset) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset: ${preset} (expected one of: ${Object.keys(PRESETS).join(', ')})`);
  return { ...p };
}
// --- end presets ---

// --- task-branches (generated from lib/task-branches.mjs — do not edit) ---
// lib/task-branches.mjs — パーサ部（Task 3 でルーティング関数を追記する）
/**
 * レビュアー/再レビュアー/最終レビュアーの構造化 Markdown 出力から、分岐に
 * 必要な決め行だけを寛容にパースする。パーサは大文字小文字・絵文字の有無・
 * 括弧内注記の揺れを吸収するが、決め行そのものが無ければ parseErrors に積んで
 * fail closed の判断を呼び出し側（workflow.mjs）に委ねる。
 */

function section(text, header) {
  const re = new RegExp(`###\\s*${header}\\b([\\s\\S]*?)(?=\\n###(?!#)\\s|$)`, 'i');
  const m = text.match(re);
  return m ? m[1] : '';
}

function subsection(text, header) {
  const re = new RegExp(`####+\\s*${header}[^\\n]*\\n([\\s\\S]*?)(?=\\n####+\\s|\\n###+\\s|$)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function bullets(block) {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim());
}

/**
 * specGapText は "❌ Issues found:" に続く説明文。spec ❌ なのに Critical/Important
 * の bullet も説明文も無いときは、fix_required にしても実装者に渡すものが1件も
 * 無い空周回になるため parseErrors に積み、既存の「1回リトライして駄目なら
 * review_failed」という fail closed 経路に乗せる（新しい status は作らない）。
 */
function parseTaskReview(text) {
  const parseErrors = [];

  const specBlock = section(text, 'Spec Compliance');
  let specCompliant = null;
  if (/(?:❌\s*)?issues found/i.test(specBlock)) specCompliant = false;
  else if (/(?:✅\s*)?spec\s*compliant/i.test(specBlock)) specCompliant = true;
  if (specCompliant === null) parseErrors.push('Spec Compliance verdict');

  const cvMatch = specBlock.match(/cannot verify from diff:?\s*([\s\S]*)/i);
  const cannotVerifyText = cvMatch ? cvMatch[1].trim() : '';

  const gapMatch = specBlock.match(/issues found:?[ \t]*([^\n]*(?:\n(?![-*]\s)[^\n]*)*)/i);
  const specGapText = gapMatch ? gapMatch[1].trim() : '';

  const issuesBlock = section(text, 'Issues');
  const criticalItems = bullets(subsection(issuesBlock, 'Critical'));
  const importantItems = bullets(subsection(issuesBlock, 'Important'));
  const minorItems = bullets(subsection(issuesBlock, 'Minor'));

  if (specCompliant === false && criticalItems.length === 0 && importantItems.length === 0 && !specGapText) {
    parseErrors.push('Spec Compliance issue detail (❌ with no Critical/Important bullet and no explanation)');
  }

  const qualityMatch = text.match(/\*\*Task quality:\*\*\s*\[?([^\]\n]*)\]?/i);
  let taskQuality = null;
  if (qualityMatch) {
    const v = qualityMatch[1].toLowerCase();
    if (v.includes('needs fixes')) taskQuality = 'needs_fixes';
    else if (v.includes('approved')) taskQuality = 'approved';
  }
  if (taskQuality === null) parseErrors.push('Task quality verdict');

  const planMatch = text.match(/\*\*Plan-mandated findings:\*\*\s*\[?([^\]\n]*)\]?/i);
  let planMandatedText = null;
  let planMandatedItems = [];
  if (planMatch) {
    planMandatedText = planMatch[1].trim();
    if (!/^none$/i.test(planMandatedText)) {
      planMandatedItems = planMandatedText.split(/;|\n/).map((s) => s.trim()).filter(Boolean);
    }
  } else {
    parseErrors.push('Plan-mandated findings line');
  }

  return {
    specCompliant, cannotVerifyText, specGapText, criticalItems, importantItems, minorItems,
    taskQuality, planMandatedText, planMandatedItems, parseErrors,
  };
}

function parseReReview(text) {
  const parseErrors = [];

  const verdictsBlock = section(text, 'Finding Verdicts');
  const verdicts = bullets(verdictsBlock).map((line) => {
    const notAddressed = /not\s*addressed/i.test(line);
    const addressed = !notAddressed && /\baddressed\b/i.test(line);
    return {
      text: line.replace(/—.*/, '').replace(/\*\*/g, '').trim(),
      status: notAddressed ? 'not_addressed' : addressed ? 'addressed' : 'unknown',
    };
  });
  if (verdicts.some((v) => v.status === 'unknown')) parseErrors.push('Finding Verdicts (unparseable)');

  const breakageBlock = section(text, 'New Breakage in the Fix Diff');
  const newBreakage = /^\s*none\s*$/i.test(breakageBlock.trim())
    ? []
    : bullets(breakageBlock).map((line) => {
        const m = line.match(/\((critical|important|minor)\)/i);
        return { severity: (m ? m[1] : 'important').toLowerCase(), text: line };
      });

  const outOfScopeBlock = section(text, 'Out-of-Scope Observations');
  const outOfScope = /^\s*none\s*$/i.test(outOfScopeBlock.trim()) ? [] : bullets(outOfScopeBlock);

  let fixRoundComplete = null;
  if (/\*\*Fix round:\*\*[^\n]*all findings addressed/i.test(text)) fixRoundComplete = true;
  else if (/\*\*Fix round:\*\*[^\n]*findings remain open/i.test(text)) fixRoundComplete = false;
  if (fixRoundComplete === null) parseErrors.push('Fix round verdict');

  return { verdicts, newBreakage, outOfScope, fixRoundComplete, parseErrors };
}

function parseFinalReview(text) {
  const parseErrors = [];

  const issuesBlock = section(text, 'Issues');
  const criticalItems = bullets(subsection(issuesBlock, 'Critical'));
  const importantItems = bullets(subsection(issuesBlock, 'Important'));
  const minorItems = bullets(subsection(issuesBlock, 'Minor'));

  const readyMatch = text.match(/\*\*Ready to merge\??:?\*\*\s*\[?([^\]\n]*)\]?/i);
  let readyToMerge = null;
  if (readyMatch) {
    const v = readyMatch[1].toLowerCase();
    if (v.includes('with fixes')) readyToMerge = 'with_fixes';
    else if (v.includes('yes')) readyToMerge = 'yes';
    else if (v.includes('no')) readyToMerge = 'no';
  }
  if (readyToMerge === null) parseErrors.push('Ready to merge verdict');

  return { criticalItems, importantItems, minorItems, readyToMerge, parseErrors };
}

function assignRefs({ critical = [], important = [], minor = [] }) {
  const withRefs = (items, prefix) => items.map((text, i) => ({ ref: `${prefix}-${i + 1}`, text }));
  return {
    critical: withRefs(critical, 'C'),
    important: withRefs(important, 'I'),
    minor: withRefs(minor, 'M'),
  };
}

/**
 * rulings は親が人間から得た裁定の累積リスト（毎回の呼び出しで全件渡す）。
 * `{ text, governs: 'plan' | 'finding' }` で、text は plan-mandated 項目との
 * 大文字小文字無視・双方向部分一致でマッチさせる。governs:'plan' は「plan が
 * 正しいので現状維持」＝ waive、governs:'finding' は「指摘が正しいので直す」＝
 * PM-n の通常 finding に昇格。裁定の無い項目だけが plan_conflict に残る。
 */
function routeAfterReview(parsed, refs, { round, maxRound = 5, rulings = [] } = {}) {
  const findRuling = (item) => {
    const a = String(item ?? '').toLowerCase();
    if (!a) return undefined;
    return (rulings ?? []).find((r) => {
      const b = String(r?.text ?? '').toLowerCase();
      if (!b) return false;
      return a.includes(b) || b.includes(a);
    });
  };
  const unruled = [];
  const promoted = [];
  for (const item of parsed.planMandatedItems ?? []) {
    const ruling = findRuling(item);
    if (ruling?.governs === 'plan') continue;
    if (ruling?.governs === 'finding') promoted.push(item);
    else unruled.push(item);
  }
  if (unruled.length > 0) {
    return { status: 'plan_conflict', planMandated: unruled };
  }

  const baseFindings = [...refs.critical, ...refs.important];
  const synthetic = parsed.specCompliant === false && baseFindings.length === 0 && parsed.specGapText
    ? [{ ref: 'SPEC-1', text: parsed.specGapText }]
    : [];
  const openFindings = [
    ...baseFindings,
    ...synthetic,
    ...promoted.map((text, i) => ({ ref: `PM-${i + 1}`, text })),
  ];
  if (parsed.specCompliant === true && openFindings.length === 0) {
    return { status: 'complete', deferredMinors: refs.minor.map((m) => m.text) };
  }
  if (round >= maxRound) {
    return { status: 'capped', residualFindings: openFindings };
  }
  return { status: 'fix_required', openFindings };
}

function routeAfterReReview(parsed, { round, maxRound = 5 } = {}) {
  const notAddressed = parsed.verdicts.filter((v) => v.status === 'not_addressed').map((v) => v.text);
  const newBlocking = parsed.newBreakage
    .filter((b) => b.severity === 'critical' || b.severity === 'important')
    .map((b) => b.text);
  const open = [...notAddressed, ...newBlocking];

  if (open.length === 0 && parsed.fixRoundComplete === true) {
    return {
      status: 'complete',
      deferredMinors: [
        ...parsed.newBreakage.filter((b) => b.severity === 'minor').map((b) => b.text),
        ...parsed.outOfScope,
      ],
    };
  }
  if (round >= maxRound) {
    return { status: 'capped', residualFindings: open };
  }
  return { status: 'fix_required', openFindings: open };
}

function routeFinalReview(parsed, refs) {
  const openFindings = [...refs.critical, ...refs.important];
  return { status: openFindings.length === 0 ? 'clean' : 'has_findings', openFindings };
}

function guardFixApplied(reportText, round) {
  if (round < 2) return { ok: true };
  const marker = `## Fix Round ${round - 1}`;
  const ok = typeof reportText === 'string' && reportText.includes(marker);
  return ok ? { ok: true } : { ok: false, reason: `report file has no "${marker}" section` };
}

function buildLedgerLine({
  taskN, status, baseSha, headSha, round,
  unverifiableCount = 0, parkedCount = 0, openFindings = [], residualFindings = [],
}) {
  const range = baseSha && headSha ? `commits ${baseSha.slice(0, 7)}..${headSha.slice(0, 7)}` : null;
  const joinFindings = (items) => items.map((f) => (typeof f === 'string' ? f : f.text)).join('; ');

  switch (status) {
    case 'complete': {
      const parts = ['review clean'];
      if (unverifiableCount > 0) parts.push(`unverifiable ${unverifiableCount} resolved`);
      if (parkedCount > 0) parts.push(`${parkedCount} parked`);
      return `Task ${taskN}: complete (${range}, ${parts.join(', ')})`;
    }
    case 'fix_required':
      return `Task ${taskN}: fix round ${round}/5 (${openFindings.length} open — ${joinFindings(openFindings)}${range ? `; ${range}` : ''})`;
    case 'capped':
      return `Task ${taskN}: capped at round ${round}/5 (${residualFindings.length} residual — ${joinFindings(residualFindings)})`;
    case 'plan_conflict':
      return `Task ${taskN}: plan conflict — human ruling required (${openFindings.length} plan-mandated finding(s))`;
    case 'review_failed':
      return `Task ${taskN}: review failed — reviewer could not produce a parseable verdict`;
    case 'fix_not_applied':
      return `Task ${taskN}: fix not applied — round ${round - 1} fix report missing`;
    default:
      throw new Error(`buildLedgerLine: unknown status ${status}`);
  }
}
// --- end task-branches ---

const MAX_ROUND = 5

const ARGS = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
if (!ARGS.mode) throw new Error('workflow args missing required key: mode')

/** review-package は常に明示 OUTFILE 付きで呼ばせる（既定 OUTFILE 分岐は sdd-workspace に依存し、このスキルには無い） */
function reviewPackageCmd(skillDir, planFile, base, head, outFile) {
  return `Run \`${skillDir}/scripts/review-package ${planFile} ${base} ${head} ${outFile}\` to generate the diff package (it overwrites ${outFile} safely), then read ${outFile}.`
}
function reviewDispatchPrompt(skillDir, planFile, briefPath, constraintsPath, reportPath, diffFile, reviewFile, base, head) {
  return `Read ${skillDir}/task-reviewer-prompt.md and follow it exactly.\nBrief: ${briefPath}  Report: ${reportPath}  Constraints: ${constraintsPath}\nBASE=${base} HEAD=${head}\n${reviewPackageCmd(skillDir, planFile, base, head, diffFile)}\nWrite your report to ${reviewFile} and return it verbatim.`
}
function reReviewDispatchPrompt(skillDir, planFile, briefPath, reportPath, diffFile, reviewFile, fixBase, head, findings) {
  return `Read ${skillDir}/re-review-prompt.md and follow it exactly.\nBrief: ${briefPath}  Report: ${reportPath}\nFindings:\n${findings.join('\n')}\nFIX_BASE=${fixBase} HEAD=${head}\n${reviewPackageCmd(skillDir, planFile, fixBase, head, diffFile)}\nWrite your report to ${reviewFile} and return it verbatim.`
}

async function runTaskMode() {
  for (const k of ['skillDir', 'planFile', 'workspaceDir', 'briefPath', 'constraintsPath', 'reportPath', 'base', 'head', 'taskN', 'preset']) {
    if (!ARGS[k]) throw new Error(`workflow args missing required key: ${k}`)
  }
  const round = Number.isInteger(ARGS.startRound) ? ARGS.startRound : 1
  // base はタスク不変（ledger の commit range 用）。fixBase は「前回のレビューが見た head」で、
  // 周回ごとに親が更新する。diff の範囲と再レビューの FIX_BASE はこちらを使う。
  if (round >= 2 && !ARGS.fixBase) throw new Error('workflow args missing required key: fixBase')
  const rollingBase = round >= 2 ? ARGS.fixBase : ARGS.base
  const { reviewer } = resolvePreset(ARGS.preset)
  const diffFile = `${ARGS.workspaceDir}/review-${rollingBase.slice(0, 7)}..${ARGS.head.slice(0, 7)}.diff`
  const reviewFile = `${ARGS.workspaceDir}/task-${ARGS.taskN}-review-R${round}.md`

  phase('Guard')
  if (round >= 2) {
    const guard = guardFixApplied(ARGS.reportText ?? '', round)
    if (!guard.ok) {
      return {
        status: 'fix_not_applied', round, commits: { base: ARGS.base, head: ARGS.head },
        ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'fix_not_applied', round }),
      }
    }
  }

  phase('Review')
  const isRereview = round >= 2
  const prompt = isRereview
    ? reReviewDispatchPrompt(ARGS.skillDir, ARGS.planFile, ARGS.briefPath, ARGS.reportPath, diffFile, reviewFile, rollingBase, ARGS.head, ARGS.priorOpenFindings ?? [])
    : reviewDispatchPrompt(ARGS.skillDir, ARGS.planFile, ARGS.briefPath, ARGS.constraintsPath, ARGS.reportPath, diffFile, reviewFile, rollingBase, ARGS.head)
  const label = isRereview ? 're-review' : 'review'

  let text = await agent(prompt, { label, phase: 'Review', model: reviewer })
  let parsed = isRereview ? parseReReview(text ?? '') : parseTaskReview(text ?? '')
  if (parsed.parseErrors.length > 0) {
    text = await agent(`${prompt}\n(前回この決め行が読めなかった: ${parsed.parseErrors.join(', ')} — フォーマットを厳守すること)`, { label, phase: 'Review', model: reviewer })
    parsed = isRereview ? parseReReview(text ?? '') : parseTaskReview(text ?? '')
    if (parsed.parseErrors.length > 0) {
      return {
        status: 'review_failed', round, commits: { base: ARGS.base, head: ARGS.head },
        ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'review_failed' }),
      }
    }
  }

  phase('Route')
  let routed
  if (isRereview) {
    routed = routeAfterReReview(parsed, { round, maxRound: MAX_ROUND })
  } else {
    const refs = assignRefs({ critical: parsed.criticalItems, important: parsed.importantItems, minor: parsed.minorItems })
    routed = routeAfterReview(parsed, refs, { round, maxRound: MAX_ROUND, rulings: ARGS.rulings ?? [] })
  }

  const nextFixMode = round <= 3 ? 'resume' : 'fresh'
  const unverifiableCount = isRereview ? 0 : (parsed.cannotVerifyText ? 1 : 0)
  const common = {
    round, commits: { base: ARGS.base, head: ARGS.head }, reviewFile,
    unverifiable: isRereview ? '' : parsed.cannotVerifyText,
  }

  if (routed.status === 'plan_conflict') {
    return { ...common, status: 'plan_conflict', planMandated: routed.planMandated, ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'plan_conflict', openFindings: routed.planMandated }) }
  }
  if (routed.status === 'complete') {
    return { ...common, status: 'complete', deferredMinors: routed.deferredMinors, ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'complete', baseSha: ARGS.base, headSha: ARGS.head, unverifiableCount }) }
  }
  if (routed.status === 'capped') {
    return { ...common, status: 'capped', residualFindings: routed.residualFindings, ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'capped', round, residualFindings: routed.residualFindings }) }
  }
  return { ...common, status: 'fix_required', openFindings: routed.openFindings, nextFixMode, ledgerLine: buildLedgerLine({ taskN: ARGS.taskN, status: 'fix_required', round, baseSha: ARGS.base, headSha: ARGS.head, openFindings: routed.openFindings }) }
}

async function runFinalMode() {
  for (const k of ['skillDir', 'planFile', 'workspaceDir', 'mergeBase', 'head']) {
    if (!ARGS[k]) throw new Error(`workflow args missing required key: ${k}`)
  }
  const diffFile = `${ARGS.workspaceDir}/review-final-${ARGS.mergeBase.slice(0, 7)}..${ARGS.head.slice(0, 7)}.diff`
  const reviewFile = `${ARGS.workspaceDir}/final-review.md`
  const reportFile = `${ARGS.workspaceDir}/final-report.md`

  phase('Review')
  const reviewPrompt = `Read ${ARGS.skillDir}/final-review-prompt.md and follow it exactly.\nBase: ${ARGS.mergeBase}  Head: ${ARGS.head}\nPlan / requirements: ${ARGS.planFile} — read it for what was required and what "done" means for this branch.\n${reviewPackageCmd(ARGS.skillDir, ARGS.planFile, ARGS.mergeBase, ARGS.head, diffFile)}\nWrite your report to ${reviewFile} and return it verbatim.`
  let reviewText = await agent(reviewPrompt, { label: 'final-review', phase: 'Review', model: FINAL_REVIEW_MODEL })
  let parsed = parseFinalReview(reviewText ?? '')
  if (parsed.parseErrors.length > 0) {
    reviewText = await agent(`${reviewPrompt}\n(前回この決め行が読めなかった: ${parsed.parseErrors.join(', ')} — フォーマットを厳守すること)`, { label: 'final-review', phase: 'Review', model: FINAL_REVIEW_MODEL })
    parsed = parseFinalReview(reviewText ?? '')
    if (parsed.parseErrors.length > 0) {
      return { status: 'review_failed', commits: { base: ARGS.mergeBase, head: ARGS.head }, ledgerLine: buildLedgerLine({ taskN: 'final', status: 'review_failed' }) }
    }
  }
  const refs = assignRefs({ critical: parsed.criticalItems, important: parsed.importantItems, minor: parsed.minorItems })
  const routed = routeFinalReview(parsed, refs)

  if (routed.status === 'clean') {
    return {
      status: 'clean', residualFindings: [], commits: { base: ARGS.mergeBase, head: ARGS.head },
      ledgerLine: buildLedgerLine({ taskN: 'final', status: 'complete', baseSha: ARGS.mergeBase, headSha: ARGS.head }),
    }
  }

  phase('Fix')
  const fixText = await agent(
    `Read ${ARGS.skillDir}/final-fixer-prompt.md and follow it exactly.\nFindings:\n${routed.openFindings.map((f) => f.text).join('\n')}\nBase: ${ARGS.mergeBase}  Head: ${ARGS.head}  Diff: ${diffFile}  Report: ${reportFile}`,
    { label: 'final-fix', phase: 'Fix', model: FINAL_REVIEW_MODEL },
  )
  // fixer が New HEAD を報告しないと Verify の diff 範囲が決まらない。未報告は
  // パース不能なレビューと同じ扱い（fail closed）にする。
  const newHeadMatch = (fixText ?? '').match(/\*\*New HEAD:\*\*\s*([0-9a-f]{7,40})/i)
  if (!newHeadMatch) {
    return { status: 'review_failed', commits: { base: ARGS.mergeBase, head: ARGS.head }, ledgerLine: buildLedgerLine({ taskN: 'final', status: 'review_failed' }) }
  }
  const newHead = newHeadMatch[1]

  phase('Verify')
  const fixDiffFile = `${ARGS.workspaceDir}/review-final-fix.diff`
  const reReviewPrompt = `Read ${ARGS.skillDir}/re-review-prompt.md and follow it exactly.\nReport: ${reportFile}\nFindings:\n${routed.openFindings.map((f) => f.text).join('\n')}\nFIX_BASE=${ARGS.head} HEAD=${newHead}\n${reviewPackageCmd(ARGS.skillDir, ARGS.planFile, ARGS.head, newHead, fixDiffFile)}`
  let reReviewText = await agent(reReviewPrompt, { label: 're-review', phase: 'Verify', model: FINAL_REVIEW_MODEL })
  let reParsed = parseReReview(reReviewText ?? '')
  if (reParsed.parseErrors.length > 0) {
    reReviewText = await agent(`${reReviewPrompt}\n(前回この決め行が読めなかった: ${reParsed.parseErrors.join(', ')} — フォーマットを厳守すること)`, { label: 're-review', phase: 'Verify', model: FINAL_REVIEW_MODEL })
    reParsed = parseReReview(reReviewText ?? '')
    if (reParsed.parseErrors.length > 0) {
      return { status: 'review_failed', commits: { base: ARGS.mergeBase, head: ARGS.head }, ledgerLine: buildLedgerLine({ taskN: 'final', status: 'review_failed' }) }
    }
  }
  const reRouted = routeAfterReReview(reParsed, { round: 1, maxRound: 1 })

  if (reRouted.status === 'complete') {
    return {
      status: 'clean', residualFindings: [], commits: { base: ARGS.mergeBase, head: ARGS.head },
      ledgerLine: buildLedgerLine({ taskN: 'final', status: 'complete', baseSha: ARGS.mergeBase, headSha: ARGS.head }),
    }
  }
  const residualFindings = reRouted.residualFindings ?? reRouted.openFindings
  return {
    status: 'residual', residualFindings, commits: { base: ARGS.mergeBase, head: ARGS.head },
    ledgerLine: buildLedgerLine({ taskN: 'final', status: 'capped', round: 1, residualFindings }),
  }
}

if (ARGS.mode === 'task') {
  return await runTaskMode()
}
if (ARGS.mode === 'final') {
  return await runFinalMode()
}
throw new Error(`unsupported mode: ${ARGS.mode}`)
