/**
 * batch-plan.mjs
 *
 * 次に消化する「まとまり」を 1 つ返す。単体は最大 UNIT_BATCH_SIZE 件、結合と E2E は 1 件。
 *
 * まとまりはレベルをまたがない。環境の要る行と要らない行が同じまとまりに入ると環境
 * モデルが破綻するため。飛び飛びに残っていても同じ規則で束ねる (2 周目以降のため)。
 *
 * 試行上限に達した todo は含めない。呼び出し側 (反映スクリプト) が別途 exhaust として
 * error を書く。
 */
import { CASE_LEVELS } from "./ledger.mjs";
import { UNIT_BATCH_SIZE, MAX_ATTEMPTS } from "./constants.mjs";

function isEligible(row, maxAttempts) {
  if (row.status !== "todo") return false;
  const a = Number.parseInt(row.attempts, 10);
  if (!Number.isInteger(a)) return false;
  return a < maxAttempts;
}

function isTodo(row) {
  return row.status === "todo";
}

export function nextBatch(rows, { maxAttempts = MAX_ATTEMPTS, unitBatchSize = UNIT_BATCH_SIZE } = {}) {
  for (const level of CASE_LEVELS) {
    const todosInLevel = rows.filter((r) => r.level === level && isTodo(r));
    if (todosInLevel.length === 0) continue;
    const eligible = todosInLevel.filter((r) => isEligible(r, maxAttempts));
    const exhausted = todosInLevel.filter((r) => !isEligible(r, maxAttempts));
    const size = level === "unit" ? unitBatchSize : 1;
    const caseIds = eligible.slice(0, size).map((r) => r.case_id);
    const exhaustedCaseIds = exhausted.map((r) => r.case_id);
    return { level, caseIds, exhaustedCaseIds };
  }
  return null;
}

if (process.argv[1]?.endsWith("batch-plan.mjs")) {
  const dirArg = process.argv.indexOf("--dir");
  if (dirArg === -1) {
    process.stderr.write("usage: batch-plan.mjs --dir <artifact>\n");
    process.exit(2);
  }
  const dir = process.argv[dirArg + 1];
  const { readCases } = await import("./ledger.mjs");
  const { casesPath } = await import("./paths.mjs");
  const rows = readCases(casesPath(dir));
  const batch = nextBatch(rows);
  process.stdout.write(`${JSON.stringify({ batch })}\n`);
}
