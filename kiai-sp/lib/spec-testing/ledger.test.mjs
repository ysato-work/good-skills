import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CASE_COLUMNS,
  CASE_LEVELS,
  CASE_STATUSES,
  REQUIREMENT_COLUMNS,
  caseId,
  parseReqIds,
  readCases,
  readRequirements,
  reqId,
  validateCases,
  validateRequirements,
  writeCases,
  writeRequirements,
} from "./ledger.mjs";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "spec-testing-ledger-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function aCase(over = {}) {
  const base = {
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    technique: "境界値",
    box: "white",
    title: "境界の下限",
    preconditions: "なし",
    steps: "1. 呼ぶ",
    expected: "0 が返る",
    status: "todo",
    out_of_scope_reason: "",
    attempts: "0",
    evidence_path: "",
    test_code_path: "",
    updated_at: "",
  };
  return { ...base, ...over };
}

test("列の定義が契約どおり", () => {
  assert.deepEqual(CASE_COLUMNS, [
    "case_id", "level", "req_ids", "technique", "box", "title", "preconditions",
    "steps", "expected", "status", "out_of_scope_reason", "attempts",
    "evidence_path", "test_code_path", "updated_at",
  ]);
  assert.deepEqual(REQUIREMENT_COLUMNS, [
    "req_id", "spec_section", "quote", "testable", "untestable_reason",
  ]);
  assert.deepEqual(CASE_LEVELS, ["unit", "integration", "e2e"]);
  assert.deepEqual(CASE_STATUSES, ["todo", "pass", "fail", "out_of_scope", "error"]);
});

test("ID は 3 桁ゼロ埋め", () => {
  assert.equal(caseId(1), "T-001");
  assert.equal(caseId(42), "T-042");
  assert.equal(reqId(7), "R-007");
});

test("parseReqIds はカンマ区切りを空白ごと処理する", () => {
  assert.deepEqual(parseReqIds("R-003, R-007"), ["R-003", "R-007"]);
  assert.deepEqual(parseReqIds(""), []);
  assert.deepEqual(parseReqIds(undefined), []);
});

test("writeCases と readCases はタブと改行入りのセルを往復できる", () => {
  withDir((dir) => {
    const path = join(dir, "cases.tsv");
    const rows = [aCase({ steps: "1. 立てる\n2. 叩く\tHTTP" })];
    writeCases(path, rows);
    assert.deepEqual(readCases(path), rows);
  });
});

test("writeCases は一時ファイルを残さない", () => {
  withDir((dir) => {
    writeCases(join(dir, "cases.tsv"), [aCase()]);
    assert.deepEqual(readdirSync(dir), ["cases.tsv"]);
  });
});

test("readCases はヘッダが契約と違えば拒否する", () => {
  withDir((dir) => {
    const path = join(dir, "cases.tsv");
    writeFileSync(path, "case_id\tlevel\n T-001\tunit\n", "utf8");
    assert.throws(() => readCases(path), /ヘッダが契約と違う/);
  });
});

test("writeRequirements と readRequirements が往復する", () => {
  withDir((dir) => {
    const path = join(dir, "requirements.tsv");
    const rows = [{
      req_id: "R-001",
      spec_section: "決定事項 > 3 番目の箇条書き",
      quote: "台帳は TSV 1 枚とする",
      testable: "yes",
      untestable_reason: "",
    }];
    writeRequirements(path, rows);
    assert.deepEqual(readRequirements(path), rows);
  });
});

test("validateCases は正しい台帳に何も言わない", () => {
  assert.deepEqual(validateCases([aCase(), aCase({ case_id: "T-002", level: "e2e" })]), []);
});

test("validateCases は case_id の形式違反と重複を拾う", () => {
  const problems = validateCases([aCase({ case_id: "T-1" }), aCase(), aCase()]);
  assert.equal(problems.filter((p) => p.includes("T-001 形式でない")).length, 1);
  assert.equal(problems.filter((p) => p.includes("重複")).length, 1);
});

test("validateCases は知らない level と status を拒否する", () => {
  const problems = validateCases([aCase({ level: "phase1", status: "running" })]);
  assert.equal(problems.filter((p) => p.includes("level")).length, 1);
  assert.equal(problems.filter((p) => p.includes("status")).length, 1);
});

test("validateCases は level の並びが unit -> integration -> e2e でないと拾う", () => {
  const problems = validateCases([
    aCase({ case_id: "T-001", level: "e2e" }),
    aCase({ case_id: "T-002", level: "unit" }),
  ]);
  assert.equal(problems.filter((p) => p.includes("並び")).length, 1);
});

test("validateCases は out_of_scope と理由の対応を両方向で見る", () => {
  const missing = validateCases([aCase({ status: "out_of_scope", out_of_scope_reason: "" })]);
  assert.equal(missing.filter((p) => p.includes("out_of_scope_reason が空")).length, 1);

  const extra = validateCases([aCase({ status: "todo", out_of_scope_reason: "外部 SaaS" })]);
  assert.equal(extra.filter((p) => p.includes("入っている")).length, 1);
});

test("validateCases は attempts が整数でないと拾う", () => {
  const problems = validateCases([aCase({ attempts: "いちど" })]);
  assert.equal(problems.filter((p) => p.includes("attempts")).length, 1);
});

function aReq(over = {}) {
  return {
    req_id: "R-001",
    spec_section: "決定事項 > 3 番目の箇条書き",
    quote: "台帳は TSV 1 枚とする",
    testable: "yes",
    untestable_reason: "",
    ...over,
  };
}

test("validateRequirements は正しい台帳に何も言わない", () => {
  assert.deepEqual(
    validateRequirements([aReq(), aReq({ req_id: "R-002", testable: "no", untestable_reason: "UI が無い" })]),
    [],
  );
});

test("validateRequirements は req_id の形式違反と重複を拾う", () => {
  const problems = validateRequirements([aReq({ req_id: "R-1" }), aReq(), aReq()]);
  assert.equal(problems.filter((p) => p.includes("R-001 形式でない")).length, 1);
  assert.equal(problems.filter((p) => p.includes("重複")).length, 1);
});

test("validateRequirements は testable が yes / no のどちらでもないと拾う", () => {
  const problems = validateRequirements([aReq({ testable: "maybe" })]);
  assert.equal(problems.filter((p) => p.includes("testable")).length, 1);
});

test("validateRequirements は testable と untestable_reason の対応を両方向で見る", () => {
  const missing = validateRequirements([aReq({ testable: "no", untestable_reason: "" })]);
  assert.equal(missing.filter((p) => p.includes("untestable_reason が空")).length, 1);

  const extra = validateRequirements([aReq({ testable: "yes", untestable_reason: "UI が無い" })]);
  assert.equal(extra.filter((p) => p.includes("入っている")).length, 1);
});
