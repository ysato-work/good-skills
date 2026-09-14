/**
 * flat-issues.json を読み込み、issue を BATCH_SIZE 件ずつのバッチに分割して
 * <workdir>/confidence-batches/batch-NNN.json に書き出す。
 * 各バッチは confidence-scorer 1 エージェントが担当する単位。
 * バッチ内の各エントリは {id, issue_path, output_path} を持ち、
 * scorer はこれを走査して confidence/<id>.json を個別に書き出す。
 *
 * Usage: node chunk-confidence-batches.mjs <workdir> [batch_size]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BATCH_SIZE = 20;

function chunkConfidenceBatches(workdir, batchSize = BATCH_SIZE) {
  const flatPath = join(workdir, "flat-issues.json");
  if (!existsSync(flatPath)) return [];

  let issues;
  try {
    issues = JSON.parse(readFileSync(flatPath, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(issues) || issues.length === 0) return [];

  const batchDir = join(workdir, "confidence-batches");
  mkdirSync(batchDir, { recursive: true });

  const batchPaths = [];
  for (let i = 0; i < issues.length; i += batchSize) {
    const chunk = issues.slice(i, i + batchSize).map((issue) => ({
      id: issue.id,
      issue_path: join(workdir, "flat-issues", `${issue.id}.json`),
      output_path: join(workdir, "confidence", `${issue.id}.json`),
    }));
    const seq = String(batchPaths.length + 1).padStart(3, "0");
    const batchPath = join(batchDir, `batch-${seq}.json`);
    writeFileSync(batchPath, JSON.stringify(chunk, null, 2));
    batchPaths.push(batchPath);
  }
  return batchPaths;
}

if (process.argv[1]?.endsWith("chunk-confidence-batches.mjs")) {
  const [workdir, sizeArg] = process.argv.slice(2);
  if (!workdir) {
    console.error("Usage: node chunk-confidence-batches.mjs <workdir> [batch_size]");
    process.exit(1);
  }
  const size = sizeArg ? Number.parseInt(sizeArg) : BATCH_SIZE;
  const paths = chunkConfidenceBatches(workdir, size);
  process.stdout.write(`${JSON.stringify(paths)}\n`);
  process.stderr.write(`${paths.length} batches written (size=${size})\n`);
}

export { chunkConfidenceBatches, BATCH_SIZE };
