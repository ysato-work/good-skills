/**
 * recovery.mjs
 *
 * 中断からの再開時に、未反映の結果メモを畳み込み、孤立した証跡を消す。
 *
 * 未反映メモを畳み込むと、既に実行済みのケースが再実行されない。冪等に保つため、
 * 反映したメモは消す。
 *
 * 孤立した証跡 (台帳が todo なのに evidence がある) を消しておかないと、証跡の使い回し
 * 検査が前回の証跡を見て誤検知する。
 */
import { existsSync, rmSync } from "node:fs";
import { readCases } from "./ledger.mjs";
import { casesPath, evidenceDir } from "./paths.mjs";
import { listMemos, deleteMemo } from "./result-memo.mjs";
import { applyResult } from "../../skills/executing-spec-tests/lib/apply-result.mjs";

export function applyPendingMemos(artifactDir, opts = {}) {
  const applied = [];
  const skipped = [];
  for (const { caseId, memo } of listMemos(artifactDir)) {
    try {
      const result = applyResult(
        artifactDir,
        caseId,
        { status: memo.status, testCodePath: memo.test_code_path },
        opts,
      );
      applied.push({ caseId, status: result.status });
      deleteMemo(artifactDir, caseId);
    } catch (e) {
      skipped.push({ caseId, reason: String(e?.message ?? e) });
    }
  }
  return { applied, skipped };
}

export function deleteOrphanEvidence(artifactDir) {
  const rows = readCases(casesPath(artifactDir));
  const deleted = [];
  for (const r of rows) {
    if (r.status !== "todo") continue;
    if (!/^T-\d{3}$/.test(String(r.case_id))) continue;
    const dir = evidenceDir(artifactDir, r.case_id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      deleted.push(r.case_id);
    }
  }
  return deleted;
}
