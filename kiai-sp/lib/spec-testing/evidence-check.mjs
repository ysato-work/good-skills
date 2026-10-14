/**
 * evidence-check.mjs
 *
 * 証跡の 3 種の機械的検査。判定に LLM を挟まない。同じ証跡を入れたら必ず同じ結果が出る。
 *
 * 1. commands.md に「実行コマンドと終了コードの対」が 1 件以上ある
 * 2. commands.md が参照するログファイルが実在し、空でない (「(記録なし)」注記行は除外)
 * 3. 同じまとまり内で、ログ本文のハッシュ集合が完全一致する 2 件が無い
 *
 * 「上から 1 件ずつ」の規律は機械検査ではなく実行係のプロンプト側で守らせる。
 * 更新時刻ベースの検査は再周回と両立しないので入れない。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { commandsPath, evidenceDir } from "./paths.mjs";

/** base 配下に real が収まるか (base 自身も許容) */
function isContained(base, real) {
  return real === base || real.startsWith(base + sep);
}

/**
 * dir 配下に収まらない logName を弾く。収まらなければ null。
 * レキシカル (resolve + prefix) チェックに加え、シンボリックリンクで
 * dir の外を指すケースも realpathSync で実体を確認して弾く
 * (../ を含まない logName でも symlink 経由で外部ファイルを指せるため)。
 */
function resolveLogPath(dir, logName) {
  const base = resolve(dir);
  const resolved = resolve(dir, logName);
  if (!isContained(base, resolved)) return null;
  if (!existsSync(resolved)) return resolved; // 「実在しない」は呼び出し側の既存メッセージに任せる
  const realBase = realpathSync(base);
  const realResolved = realpathSync(resolved);
  if (!isContained(realBase, realResolved)) return null;
  return resolved;
}

/**
 * commands.md の 4 列テーブル (| # | コマンド | 終了コード | ログ |) を読み取る。
 * renderCommands() の実出力形式に合わせる。
 *
 * データ行の判定: 列 0 が正整数 (「#」ヘッダは NaN で弾く) かつ列 2 が非負整数。
 * ログ名の抽出: 列 3 のバッククォートを除いた中身。「(記録なし)」を含む行は noLog: true。
 *
 * export しているのはテストと再利用のため。
 */
export function parseCommandRows(md) {
  const rows = [];
  const lines = String(md).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*-{3,}/.test(line)) continue; // 区切り行
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const index = Number.parseInt(cells[0], 10);
    const exitCode = Number.parseInt(cells[2], 10);
    if (!Number.isInteger(index) || index < 1) continue; // ヘッダ (「#」) を弾く
    if (!Number.isInteger(exitCode) || exitCode < 0) continue;
    const commandCell = cells[1].replace(/^`|`$/g, "");
    const logCell = cells[3];
    const noLog = /\(記録なし\)/.test(logCell);
    const logName = noLog ? "" : logCell.replace(/^`|`$/g, "").trim();
    rows.push({ index, command: commandCell, exitCode, logName, noLog });
  }
  return rows;
}

export function checkCommandsRecorded(artifactDir, caseId) {
  const path = commandsPath(artifactDir, caseId);
  if (!existsSync(path)) return { ok: false, reason: "commands.md が無い" };
  const md = readFileSync(path, "utf8");
  const rows = parseCommandRows(md);
  if (rows.length === 0) return { ok: false, reason: "commands.md に実行コマンドと終了コードの対が 1 件も無い" };
  return { ok: true };
}

export function checkReferencedLogsExist(artifactDir, caseId) {
  const path = commandsPath(artifactDir, caseId);
  if (!existsSync(path)) return { ok: false, reason: "commands.md が無い" };
  const md = readFileSync(path, "utf8");
  const rows = parseCommandRows(md);
  const dir = evidenceDir(artifactDir, caseId);
  for (const row of rows) {
    if (row.noLog) continue;
    if (!row.logName) return { ok: false, reason: `ログ名が読み取れない行がある: ${row.command}` };
    const logPath = resolveLogPath(dir, row.logName);
    if (!logPath) return { ok: false, reason: `参照ログが実在しない: ${row.logName}` };
    if (!existsSync(logPath)) return { ok: false, reason: `参照ログが実在しない: ${row.logName}` };
    if (statSync(logPath).size === 0) return { ok: false, reason: `参照ログが空: ${row.logName}` };
  }
  return { ok: true };
}

/** ケースごとに、ログ本文のハッシュ集合を 1 個の指紋にする */
function fingerprintOf(artifactDir, caseId) {
  const path = commandsPath(artifactDir, caseId);
  if (!existsSync(path)) return null;
  const rows = parseCommandRows(readFileSync(path, "utf8"));
  const digests = [];
  const dir = evidenceDir(artifactDir, caseId);
  for (const row of rows) {
    if (row.noLog || !row.logName) continue;
    const logPath = resolveLogPath(dir, row.logName);
    if (!logPath) continue;
    if (!existsSync(logPath)) continue;
    const body = readFileSync(logPath, "utf8");
    if (body.length === 0) continue;
    digests.push(createHash("sha256").update(body).digest("hex"));
  }
  if (digests.length === 0) return null;
  digests.sort();
  return createHash("sha256").update(digests.join("\n")).digest("hex");
}

export function duplicateLogDigestPairs(artifactDir, caseIds) {
  const byFp = new Map();
  for (const caseId of caseIds) {
    const fp = fingerprintOf(artifactDir, caseId);
    if (!fp) continue;
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(caseId);
  }
  const groups = [];
  for (const ids of byFp.values()) {
    if (ids.length >= 2) groups.push(ids);
  }
  return groups;
}

export function checkBatchEvidence(artifactDir, caseIds) {
  const problems = [];
  for (const caseId of caseIds) {
    for (const check of [checkCommandsRecorded, checkReferencedLogsExist]) {
      const v = check(artifactDir, caseId);
      if (!v.ok) problems.push({ caseId, reason: v.reason });
    }
  }
  const dups = duplicateLogDigestPairs(artifactDir, caseIds);
  for (const group of dups) {
    for (const caseId of group) {
      problems.push({ caseId, reason: `同じログ本文の使い回し: ${group.join(", ")}` });
    }
  }
  return { ok: problems.length === 0, problems };
}
