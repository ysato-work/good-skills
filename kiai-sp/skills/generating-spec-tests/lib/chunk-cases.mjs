/**
 * chunk-cases.mjs
 *
 * レビュー合議の fan-out 用に、テストケースをチャンクへ割る。
 *
 * fan-out の軸は判定観点ではなくチャンクである。観点ごとにエージェントを分けると
 * 1 体が全ケースを読むことになり、件数が増えたときに文脈が破綻する。チャンクで
 * 区切れば 1 体あたりの読む量が一定に保たれ、5 つの判定軸を 1 体が全部見られる。
 *
 * ただしチャンクに割ると「ケースに不足がないか」を誰も判定できなくなる。そのため
 * 全体を通して見る 1 体を別に立て、そこには全ケースの要約だけを渡す。要約に削るのは
 * 全件の実体を渡すとチャンク化の意味が消えるからである。
 *
 * 要件は全チャンクが参照するので 1 ファイルに 1 回だけ書き、パスを渡す。チャンクごとに
 * 複製すると件数分だけ膨らむ。
 *
 * export:
 *   CHUNK_SIZE
 *   chunkCases(cases, size)          → チャンクの配列
 *   summarizeForWhole(caseObj)       → 全体レビュア向けの要約
 *   writeBundle(workdir, opts)       → { requirementsPath, chunkPaths, wholePath, labels }
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 1 体のレビュアが見るケース数 */
export const CHUNK_SIZE = 20;

export function chunkCases(cases, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < cases.length; i += size) chunks.push(cases.slice(i, i + size));
  return chunks;
}

export function summarizeForWhole(caseObj) {
  return {
    case_id: caseObj.case_id,
    level: caseObj.level,
    req_ids: caseObj.req_ids,
    title: caseObj.title,
    status: caseObj.status,
    out_of_scope_reason: caseObj.out_of_scope_reason,
  };
}

export function writeBundle(workdir, { requirements = [], cases = [], size = CHUNK_SIZE } = {}) {
  const chunkDir = join(workdir, "chunks");
  mkdirSync(chunkDir, { recursive: true });

  const requirementsPath = join(workdir, "requirements.json");
  writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2), "utf8");

  const chunkPaths = [];
  const labels = [];
  chunkCases(cases, size).forEach((chunk, i) => {
    const label = `chunk-${String(i + 1).padStart(3, "0")}`;
    const path = join(chunkDir, `${label}.json`);
    writeFileSync(path, JSON.stringify(chunk, null, 2), "utf8");
    chunkPaths.push(path);
    labels.push(label);
  });

  const wholePath = join(chunkDir, "whole.json");
  writeFileSync(wholePath, JSON.stringify(cases.map(summarizeForWhole), null, 2), "utf8");
  labels.push("whole");

  return { requirementsPath, chunkPaths, wholePath, labels };
}
