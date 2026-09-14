/**
 * ledger.mjs
 *
 * cases.tsv と requirements.tsv のスキーマと、その読み書き・検証。
 *
 * 書き込みは毎回ファイル全体を書き直す。別名で書いてから rename で置き換えるので、
 * 途中で切れても壊れた行が残らない。数百行の TSV なら書き直しの費用は無視できる。
 * 一時ファイル名をドット始まりにしてあるのは、通常の glob や日常のツールの目に
 * 触れにくくするため。正常時は rename で消えるので、残っていたら書き込みが途中で
 * 切れた証拠であり、納品検査がそれを見つけて止める。
 *
 * validateCases は問題を throw せず配列で返す。無人実行では「1 件目で止まって残りが
 * 見えない」のが一番困る。全部まとめて出す。
 *
 * status の todo / pass / fail / out_of_scope / error は潰さない。fail は「テスト対象に
 * 不具合があった」、error は「テストを実行できなかった」で、無人実行でこの 2 つを同じ
 * 値にすると区別が永久に失われる。running は持たない。逐次実行かつ全体書き直しなので、
 * 中断時に実行中だった行は todo のまま残り、再開すると再実行されて冪等になる。
 *
 * export:
 *   CASE_COLUMNS / REQUIREMENT_COLUMNS / CASE_LEVELS / CASE_STATUSES / BOXES
 *   caseId(n) / reqId(n) / parseReqIds(cell)
 *   readCases(path) / writeCases(path, rows)
 *   readRequirements(path) / writeRequirements(path, rows)
 *   validateCases(rows) → 契約違反の説明文の配列
 *   validateRequirements(rows) → 契約違反の説明文の配列
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseTsv, serializeTsv } from "./tsv.mjs";

export const CASE_COLUMNS = [
  "case_id",
  "level",
  "req_ids",
  "technique",
  "box",
  "title",
  "preconditions",
  "steps",
  "expected",
  "status",
  "out_of_scope_reason",
  "attempts",
  "evidence_path",
  "test_code_path",
  "updated_at",
];

export const REQUIREMENT_COLUMNS = [
  "req_id",
  "spec_section",
  "quote",
  "testable",
  "untestable_reason",
];

export const CASE_LEVELS = ["unit", "integration", "e2e"];
export const CASE_STATUSES = ["todo", "pass", "fail", "out_of_scope", "error"];
export const BOXES = ["white", "black"];

export function caseId(n) {
  return `T-${String(n).padStart(3, "0")}`;
}

export function reqId(n) {
  return `R-${String(n).padStart(3, "0")}`;
}

export function parseReqIds(cell) {
  return String(cell ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function readTable(path, columns, label) {
  const { header, rows } = parseTsv(readFileSync(path, "utf8"));
  if (header.join("\t") !== columns.join("\t")) {
    throw new Error(
      `${label} のヘッダが契約と違う\n  期待: ${columns.join(", ")}\n  実際: ${header.join(", ")}`,
    );
  }
  return rows;
}

function writeTable(path, columns, rows) {
  const tmp = join(dirname(path), `.${basename(path)}.tmp`);
  writeFileSync(tmp, serializeTsv(columns, rows), "utf8");
  renameSync(tmp, path);
}

export function readCases(path) {
  return readTable(path, CASE_COLUMNS, "cases.tsv");
}

export function writeCases(path, rows) {
  writeTable(path, CASE_COLUMNS, rows);
}

export function readRequirements(path) {
  return readTable(path, REQUIREMENT_COLUMNS, "requirements.tsv");
}

export function writeRequirements(path, rows) {
  writeTable(path, REQUIREMENT_COLUMNS, rows);
}

export function validateCases(rows) {
  const problems = [];
  const seen = new Set();
  let maxLevelIndex = -1;

  rows.forEach((row, i) => {
    const at = `${i + 2} 行目 (${row.case_id || "case_id 空"})`;

    if (!/^T-\d{3}$/.test(String(row.case_id))) {
      problems.push(`${at}: case_id が T-001 形式でない`);
    } else if (seen.has(row.case_id)) {
      problems.push(`${at}: case_id が重複している`);
    } else {
      seen.add(row.case_id);
    }

    const levelIndex = CASE_LEVELS.indexOf(row.level);
    if (levelIndex === -1) {
      problems.push(`${at}: level が ${CASE_LEVELS.join(" / ")} のどれでもない`);
    } else if (levelIndex < maxLevelIndex) {
      problems.push(`${at}: level の並びが ${CASE_LEVELS.join(" -> ")} の順になっていない`);
    } else {
      maxLevelIndex = levelIndex;
    }

    if (!CASE_STATUSES.includes(row.status)) {
      problems.push(`${at}: status が ${CASE_STATUSES.join(" / ")} のどれでもない`);
    }

    if (!BOXES.includes(row.box)) {
      problems.push(`${at}: box が ${BOXES.join(" / ")} のどちらでもない`);
    }

    const needsReason = row.status === "out_of_scope";
    const hasReason = String(row.out_of_scope_reason ?? "").trim() !== "";
    if (needsReason && !hasReason) {
      problems.push(`${at}: out_of_scope なのに out_of_scope_reason が空`);
    }
    if (!needsReason && hasReason) {
      problems.push(`${at}: out_of_scope でないのに out_of_scope_reason が入っている`);
    }

    if (!/^\d+$/.test(String(row.attempts))) {
      problems.push(`${at}: attempts が 0 以上の整数でない`);
    }
  });

  return problems;
}

export function validateRequirements(rows) {
  const problems = [];
  const seen = new Set();

  rows.forEach((row, i) => {
    const at = `${i + 2} 行目 (${row.req_id || "req_id 空"})`;

    if (!/^R-\d{3}$/.test(String(row.req_id))) {
      problems.push(`${at}: req_id が R-001 形式でない`);
    } else if (seen.has(row.req_id)) {
      problems.push(`${at}: req_id が重複している`);
    } else {
      seen.add(row.req_id);
    }

    if (row.testable !== "yes" && row.testable !== "no") {
      problems.push(`${at}: testable が yes / no のどちらでもない`);
    }

    const needsReason = row.testable === "no";
    const hasReason = String(row.untestable_reason ?? "").trim() !== "";
    if (needsReason && !hasReason) {
      problems.push(`${at}: testable が no なのに untestable_reason が空`);
    }
    if (!needsReason && hasReason) {
      problems.push(`${at}: testable が yes なのに untestable_reason が入っている`);
    }
  });

  return problems;
}
