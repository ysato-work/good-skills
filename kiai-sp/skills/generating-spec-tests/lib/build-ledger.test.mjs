import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCases, readRequirements } from "../../../lib/spec-testing/ledger.mjs";
import {
  assertEveryCaseHasRequirement,
  buildLedger,
  sortByLevel,
  toCaseRows,
  toRequirementRows,
} from "./build-ledger.mjs";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "build-ledger-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function aCase(over = {}) {
  return {
    level: "unit",
    req_ids: ["R-001"],
    technique: "境界値",
    box: "white",
    title: "境界の下限",
    preconditions: "なし",
    steps: "1. 呼ぶ",
    expected: "0 が返る",
    ...over,
  };
}

function aReq(over = {}) {
  return {
    req_id: "R-001",
    spec_section: "決定事項",
    quote: "台帳は TSV 1 枚とする",
    testable: "yes",
    ...over,
  };
}

test("sortByLevel は unit -> integration -> e2e に並べる", () => {
  const sorted = sortByLevel([aCase({ level: "e2e" }), aCase({ level: "unit" }), aCase({ level: "integration" })]);
  assert.deepEqual(sorted.map((c) => c.level), ["unit", "integration", "e2e"]);
});

test("toCaseRows は並び順で case_id を振り直す", () => {
  const rows = toCaseRows([aCase({ level: "e2e" }), aCase({ level: "unit" })]);
  assert.deepEqual(rows.map((r) => [r.case_id, r.level]), [["T-001", "unit"], ["T-002", "e2e"]]);
});

test("toCaseRows は req_ids をカンマ区切りにする", () => {
  const rows = toCaseRows([aCase({ req_ids: ["R-001", "R-003"] })]);
  assert.equal(rows[0].req_ids, "R-001,R-003");
});

test("toCaseRows は状態の列を初期値で埋める", () => {
  const row = toCaseRows([aCase()])[0];
  assert.equal(row.status, "todo");
  assert.equal(row.attempts, "0");
  assert.equal(row.evidence_path, "");
  assert.equal(row.test_code_path, "");
  assert.equal(row.updated_at, "");
  assert.equal(row.out_of_scope_reason, "");
});

test("toCaseRows は対象外のケースに理由を残す", () => {
  const row = toCaseRows([aCase({ status: "out_of_scope", out_of_scope_reason: "外部 SaaS" })])[0];
  assert.equal(row.status, "out_of_scope");
  assert.equal(row.out_of_scope_reason, "外部 SaaS");
});

test("toRequirementRows は testable が no の理由を残す", () => {
  const rows = toRequirementRows([aReq({ testable: "no", untestable_reason: "実機必須" })]);
  assert.equal(rows[0].untestable_reason, "実機必須");
});

test("要件が 1 件も紐づいていないケースがあれば throw する", () => {
  assert.throws(
    () => assertEveryCaseHasRequirement(toCaseRows([aCase({ req_ids: [] })])),
    /T-001/,
  );
});

test("buildLedger は S1 の形式で読み戻せる台帳を書く", () => {
  withDir((dir) => {
    const out = buildLedger(dir, {
      requirements: [aReq(), aReq({ req_id: "R-002" })],
      cases: [aCase({ level: "integration", req_ids: ["R-002"] }), aCase()],
    });
    assert.equal(out.caseCount, 2);

    const cases = readCases(out.casesPath);
    assert.deepEqual(cases.map((c) => [c.case_id, c.level]), [["T-001", "unit"], ["T-002", "integration"]]);

    const requirements = readRequirements(out.requirementsPath);
    assert.deepEqual(requirements.map((r) => r.req_id), ["R-001", "R-002"]);
  });
});

test("buildLedger はセル内の改行とタブを壊さない", () => {
  withDir((dir) => {
    const steps = "1. 立てる\n2. 叩く\tHTTP";
    const out = buildLedger(dir, { requirements: [aReq()], cases: [aCase({ steps })] });
    assert.equal(readCases(out.casesPath)[0].steps, steps);
  });
});

test("buildLedger は S1 の契約に反する台帳を書かせない", () => {
  withDir((dir) => {
    assert.throws(
      () => buildLedger(dir, { requirements: [aReq()], cases: [aCase({ box: "gray" })] }),
      /box/,
    );
  });
});
