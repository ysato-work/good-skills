/**
 * apply-result.mjs
 *
 * 子が返した合否を台帳に書き戻す。1 件終わるごとに全体を書き直す。
 *
 * 3 つを機械的に守らせる。
 *
 * 1. **実施時に out_of_scope を書けない。** 対象外は生成時のレビュー合議が判定した
 *    ものだけである。実行しようとして失敗したものは error であって out_of_scope では
 *    ない。この区別が崩れると「対象外と未消化を区別できる」という受入基準が意味を
 *    失う。書こうとしたら throw する
 * 2. **証跡が無い結果は error に落とす。** 無人実行では、捕捉しなかったものは
 *    起きなかったことになる。子が「確認しました」とだけ返して証跡を書かない経路を
 *    ここで塞ぐ
 * 3. **error だけ再試行する。** fail は「テスト対象に不具合があった」なので、もう
 *    一度走らせても同じである。error は「実行できなかった」なので、環境が整えば
 *    通る可能性がある。再試行させるときは status を todo に戻す。専用の状態を足すと
 *    中断して再開したときの扱いが増えるので足さない
 *
 * export:
 *   RESULT_STATUSES / assertResultStatus(status)
 *   hasEvidence(artifactDir, caseId)
 *   decideStatus({ reported, evidence, attempts, maxAttempts })
 *   applyResult(artifactDir, caseId, result, opts)
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAX_ATTEMPTS } from "../../../lib/spec-testing/constants.mjs";
import { readCases, writeCases } from "../../../lib/spec-testing/ledger.mjs";
import { casesPath, evidenceDir } from "../../../lib/spec-testing/paths.mjs";

/** 実施フェーズが書いてよい status */
export const RESULT_STATUSES = ["pass", "fail", "error"];

export function assertResultStatus(status) {
  if (!RESULT_STATUSES.includes(status)) {
    throw new Error(
      `実施時に書ける status は ${RESULT_STATUSES.join(" / ")} だけ。受け取った値: ${status}`,
    );
  }
}

export function hasEvidence(artifactDir, caseId) {
  const path = join(evidenceDir(artifactDir, caseId), "commands.md");
  if (!existsSync(path)) return false;
  return statSync(path).size > 0;
}

export function decideStatus({ reported, evidence, attempts, maxAttempts }) {
  if (!evidence) {
    if (attempts < maxAttempts) {
      return { status: "todo", retrying: true, downgraded: true, reason: "証跡が無い" };
    }
    return { status: "error", retrying: false, downgraded: true, reason: "証跡が無い" };
  }

  if (reported === "error" && attempts < maxAttempts) {
    return { status: "todo", retrying: true, downgraded: false, reason: "実行できなかったので再試行する" };
  }

  return { status: reported, retrying: false, downgraded: false, reason: "" };
}

export function applyResult(
  artifactDir,
  caseId,
  { status, testCodePath } = {},
  { now = new Date().toISOString(), maxAttempts = MAX_ATTEMPTS } = {},
) {
  assertResultStatus(status);

  const path = casesPath(artifactDir);
  const rows = readCases(path);
  const index = rows.findIndex((r) => r.case_id === caseId);
  if (index === -1) throw new Error(`台帳に ${caseId} が無い`);

  const attempts = (Number.parseInt(rows[index].attempts, 10) || 0) + 1;
  const evidence = hasEvidence(artifactDir, caseId);
  const decided = decideStatus({ reported: status, evidence, attempts, maxAttempts });

  rows[index] = {
    ...rows[index],
    status: decided.status,
    attempts: String(attempts),
    evidence_path: evidence ? `evidence/${caseId}/` : "",
    test_code_path: testCodePath ?? rows[index].test_code_path,
    updated_at: now,
  };

  writeCases(path, rows);

  return { case_id: caseId, attempts, ...decided };
}
