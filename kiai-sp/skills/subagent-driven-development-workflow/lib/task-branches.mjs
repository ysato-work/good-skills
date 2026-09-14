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
export function parseTaskReview(text) {
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

export function parseReReview(text) {
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

export function parseFinalReview(text) {
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

export function assignRefs({ critical = [], important = [], minor = [] }) {
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
export function routeAfterReview(parsed, refs, { round, maxRound = 5, rulings = [] } = {}) {
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

export function routeAfterReReview(parsed, { round, maxRound = 5 } = {}) {
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

export function routeFinalReview(parsed, refs) {
  const openFindings = [...refs.critical, ...refs.important];
  return { status: openFindings.length === 0 ? 'clean' : 'has_findings', openFindings };
}

export function guardFixApplied(reportText, round) {
  if (round < 2) return { ok: true };
  const marker = `## Fix Round ${round - 1}`;
  const ok = typeof reportText === 'string' && reportText.includes(marker);
  return ok ? { ok: true } : { ok: false, reason: `report file has no "${marker}" section` };
}

export function buildLedgerLine({
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
