#!/usr/bin/env node
/**
 * reflect-batch.mjs
 *
 * 1 まとまり分の結果メモを台帳へ反映する CLI。反映係が起動する。
 *
 * 検査に通ったメモは applyResult で書き戻し、メモを消す。メモが無いケースと検査に
 * 落ちたケースは status: "error" で applyResult を呼ぶ (attempts < MAX_ATTEMPTS なら
 * todo に戻る)。実施時に out_of_scope を書こうとしたらプロセスを exit 2 で止める。
 *
 * assertResultStatus は applyResult 側で throw するので、それを exit 2 で拾う。
 */
import { readFileSync } from "node:fs";
import { deleteMemo, memoPath, readMemo } from "./result-memo.mjs";
import { checkBatchEvidence } from "./evidence-check.mjs";
import { applyResult, RESULT_STATUSES } from "../../skills/executing-spec-tests/lib/apply-result.mjs";

/**
 * readMemo が投げたのがスキーマ不正 (status が enum 外、つまり out_of_scope 等) の
 * せいなら、その生の status をそのまま返す。applyResult の assertResultStatus に
 * 判定を委ね、実施時に out_of_scope を書こうとした異常を exit 2 として表に出す。
 * JSON 自体が壊れている・存在しないなど読み取れない場合は null を返し、呼び出し側で
 * "error" にフォールバックさせる。
 */
function rawInvalidStatus(dir, caseId) {
  try {
    const raw = JSON.parse(readFileSync(memoPath(dir, caseId), "utf8"));
    if (raw && typeof raw.status === "string" && !RESULT_STATUSES.includes(raw.status)) {
      return raw.status;
    }
  } catch {
    // 読めない・壊れている場合は呼び出し側の "error" フォールバックに任せる
  }
  return null;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--dir" || key === "--level" || key === "--case-ids" || key === "--exhausted-ids") {
      args[key] = argv[++i];
    }
  }
  return args;
}

function splitIds(s) {
  return String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

/** case_id は台帳と同じ T-001 形式のみ許す。ファイル操作の前に呼ぶこと */
function assertCaseIdFormat(caseId) {
  if (!/^T-\d{3}$/.test(caseId)) {
    process.stderr.write(`${caseId}: case_id が T-\\d{3} 形式でない\n`);
    process.exit(2);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const dir = parsed["--dir"];
  const level = parsed["--level"];
  const caseIds = splitIds(parsed["--case-ids"]);
  const exhaustedIds = splitIds(parsed["--exhausted-ids"]);
  if (!dir || !level || (caseIds.length === 0 && exhaustedIds.length === 0)) {
    process.stderr.write("usage: reflect-batch.mjs --dir <artifact> --level <unit|integration|e2e> --case-ids <ids> [--exhausted-ids <ids>]\n");
    process.exit(2);
  }
  for (const caseId of [...caseIds, ...exhaustedIds]) assertCaseIdFormat(caseId);

  const batchCheck = checkBatchEvidence(dir, caseIds);
  const bad = new Map();
  for (const p of batchCheck.problems) {
    if (!bad.has(p.caseId)) bad.set(p.caseId, []);
    bad.get(p.caseId).push(p.reason);
  }

  const applied = [];

  for (const caseId of caseIds) {
    let memo = null;
    let invalidStatus = null;
    try {
      memo = readMemo(dir, caseId);
    } catch (e) {
      bad.set(caseId, [...(bad.get(caseId) ?? []), String(e?.message ?? e)]);
      invalidStatus = rawInvalidStatus(dir, caseId);
    }
    const reported = memo && !bad.has(caseId) ? memo.status : (invalidStatus ?? "error");
    try {
      const r = applyResult(dir, caseId, { status: reported, testCodePath: memo?.test_code_path ?? "" });
      applied.push({ caseId, status: r.status, downgraded: r.downgraded, reason: r.reason });
      if (memo && !bad.has(caseId)) deleteMemo(dir, caseId);
    } catch (e) {
      process.stderr.write(`${caseId}: ${e?.message ?? e}\n`);
      process.exit(2);
    }
  }

  // 試行上限に達した todo は error で確定させる。attempts が既に MAX なので
  // applyResult 内の decideStatus は再試行に回さず error に落とす。
  // testCodePath は undefined を渡し、apply-result 側の `??` で既存値を保持する。
  for (const caseId of exhaustedIds) {
    try {
      const r = applyResult(dir, caseId, { status: "error" });
      applied.push({ caseId, status: r.status, exhausted: true, reason: r.reason || "attempts exhausted" });
    } catch (e) {
      process.stderr.write(`${caseId}: ${e?.message ?? e}\n`);
      process.exit(2);
    }
  }

  process.stdout.write(`${JSON.stringify({ level, applied, evidenceProblems: batchCheck.problems })}\n`);
}

main();
