/**
 * evidence.mjs
 *
 * 証跡のログを書き、commands.md を組み立てる。
 *
 * ログは捨てずに truncate する。無人実行では、捕捉しなかったものは起きなかったこと
 * になる。あとから取り直せない。一方でこれはリポジトリに commit される納品物なので、
 * 上限は要る。先頭と末尾を残して中間だけを落とすのは、失敗の原因が出るのがたいてい
 * 冒頭（起動の失敗）か末尾（アサーションの失敗）だからである。
 *
 * 切るのはバイト単位なので、マルチバイト文字の途中で切ると文字化けが混ざる。切った
 * 端の不完全なバイト列を落としてから文字列に戻す。
 *
 * 1 ケースの合計はディレクトリ内の .log を数えて出す。別に状態ファイルを持たない
 * ので、途中で中断して再開しても数え直しが効く。
 *
 * export:
 *   truncateLog(text, opts)                       → { text, truncated, omittedBytes }
 *   caseLogBytes(evidenceDirPath)                 → そのケースのログ合計バイト数
 *   writeLog(evidenceDirPath, fileName, text, o)  → { path, written, truncated, capReached }
 *   renderCommands(caseId, entries, opts)         → commands.md の本文
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASE_LOG_TOTAL_MAX_BYTES,
  LOG_FILE_KEEP_BYTES,
  LOG_FILE_MAX_BYTES,
} from "./constants.mjs";

/** 末尾に残った不完全な UTF-8 シーケンスを落とす */
function dropPartialTail(buf) {
  let end = buf.byteLength;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end -= 1;
  if (end > 0 && (buf[end - 1] & 0xc0) === 0xc0) end -= 1;
  return buf.subarray(0, end);
}

/** 先頭に残った継続バイトを落とす */
function dropPartialHead(buf) {
  let start = 0;
  while (start < buf.byteLength && (buf[start] & 0xc0) === 0x80) start += 1;
  return buf.subarray(start);
}

export function truncateLog(
  text,
  { maxBytes = LOG_FILE_MAX_BYTES, keepBytes = LOG_FILE_KEEP_BYTES } = {},
) {
  const source = String(text);
  const buf = Buffer.from(source, "utf8");
  if (buf.byteLength <= maxBytes) {
    return { text: source, truncated: false, omittedBytes: 0 };
  }

  const head = dropPartialTail(buf.subarray(0, keepBytes));
  const tail = dropPartialHead(buf.subarray(buf.byteLength - keepBytes));
  const omittedBytes = buf.byteLength - head.byteLength - tail.byteLength;

  return {
    text: `${head.toString("utf8")}\n... (中略: ${omittedBytes} バイト省略) ...\n${tail.toString("utf8")}`,
    truncated: true,
    omittedBytes,
  };
}

export function caseLogBytes(evidenceDirPath) {
  if (!existsSync(evidenceDirPath)) return 0;
  return readdirSync(evidenceDirPath)
    .filter((name) => name.endsWith(".log"))
    .reduce((sum, name) => sum + statSync(join(evidenceDirPath, name)).size, 0);
}

export function writeLog(
  evidenceDirPath,
  fileName,
  text,
  { totalMaxBytes = CASE_LOG_TOTAL_MAX_BYTES } = {},
) {
  mkdirSync(evidenceDirPath, { recursive: true });

  if (caseLogBytes(evidenceDirPath) >= totalMaxBytes) {
    return { path: null, written: false, truncated: false, capReached: true };
  }

  const { text: body, truncated } = truncateLog(text);
  const path = join(evidenceDirPath, fileName);
  writeFileSync(path, body, "utf8");

  return {
    path,
    written: true,
    truncated,
    capReached: caseLogBytes(evidenceDirPath) >= totalMaxBytes,
  };
}

export function renderCommands(caseId, entries, { capReached = false } = {}) {
  const lines = [
    `# ${caseId} 実行コマンド`,
    "",
    "| # | コマンド | 終了コード | ログ |",
    "|---|---|---|---|",
  ];

  entries.forEach((entry, i) => {
    const command = String(entry.command).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const log = entry.logFile ? `\`${entry.logFile}\`` : "(記録なし)";
    lines.push(`| ${i + 1} | \`${command}\` | ${entry.exitCode} | ${log} |`);
  });

  lines.push("");
  if (capReached) {
    lines.push("1 ケースのログ合計上限に達したため、以降のログは記録していない。", "");
  }

  return lines.join("\n");
}
