/**
 * return-case.mjs
 *
 * 証跡確認係が 1 件を差し戻すときに呼ぶ。
 *
 * 保証すること:
 * - 台帳の attempts は増やさない (S1 の attempts の意味を保つため。差し戻し回数は台帳の
 *   returns 列で数える)
 * - 差し戻し上限に達したら台帳を触らず、元の status のまま確定させる (error に化けさせない)
 * - 差し戻したケースの証跡を消す (次の実行係が同じ証跡を再利用しないため)
 *
 * returns は結果メモ (周回内の一時ファイル) ではなく台帳 (cases.tsv) の行に持たせる。
 * memo は反映のたびに消える使い捨てファイルなので、そこに差し戻し回数を置くと
 * 差し戻された case が次周回で再選出されたときに 0 から数え直してしまい、
 * RETURNS_MAX に永遠に到達できない。台帳は周回をまたいで残るので、attempts と
 * 同じ位置に置く。
 *
 * caseId は外部 (証跡確認係の判断結果) から渡ってくる。evidenceDir / rmSync に
 * 渡す前に T-001 形式であることを検証する。recovery.mjs の deleteOrphanEvidence や
 * reflect-batch.mjs の assertCaseIdFormat と同じガードで、"../../evil" のような値が
 * 成果物ディレクトリ外のパスを読み書き・削除できてしまうのを防ぐ。
 */
import { existsSync, rmSync } from "node:fs";
import { readCases, writeCases } from "./ledger.mjs";
import { casesPath, evidenceDir } from "./paths.mjs";
import { RETURNS_MAX } from "./constants.mjs";

export function returnCase(artifactDir, caseId, reason, { now = new Date().toISOString(), returnsMax = RETURNS_MAX } = {}) {
  if (!/^T-\d{3}$/.test(String(caseId))) {
    throw new Error(`caseId が T-001 形式でない: ${caseId}`);
  }

  const path = casesPath(artifactDir);
  const rows = readCases(path);
  const idx = rows.findIndex((r) => r.case_id === caseId);
  if (idx === -1) throw new Error(`台帳に ${caseId} が無い`);

  const currentReturns = Number.parseInt(rows[idx].returns, 10) || 0;

  if (currentReturns >= returnsMax) {
    return { action: "kept", returns: currentReturns, reason };
  }

  const nextReturns = currentReturns + 1;
  rows[idx] = {
    ...rows[idx],
    status: "todo",
    evidence_path: "",
    returns: String(nextReturns),
    updated_at: now,
    // attempts はそのまま
  };
  writeCases(path, rows);

  const dir = evidenceDir(artifactDir, caseId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

  return { action: "returned", returns: nextReturns, reason };
}
