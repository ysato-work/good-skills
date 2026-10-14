import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextBatch } from "./batch-plan.mjs";
import { writeCases } from "./ledger.mjs";
import { casesPath } from "./paths.mjs";

const SCRIPT = "kiai-sp/lib/spec-testing/batch-plan.mjs";

function row(over) {
  return { case_id: "T-001", level: "unit", status: "todo", attempts: "0", ...over };
}

test("単体は最大 UNIT_BATCH_SIZE 件まとめる", () => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    row({ case_id: `T-${String(i + 1).padStart(3, "0")}` }),
  );
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "unit");
  assert.equal(b.caseIds.length, 10);
  assert.deepEqual(b.exhaustedCaseIds, []);
  assert.equal(b.caseIds[0], "T-001");
  assert.equal(b.caseIds[9], "T-010");
});

test("attempts >= maxAttempts の todo は exhaustedCaseIds に入る", () => {
  const rows = [
    row({ case_id: "T-001", attempts: "3" }),
    row({ case_id: "T-002", attempts: "0" }),
    row({ case_id: "T-003", attempts: "3" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.deepEqual(b.caseIds, ["T-002"]);
  assert.deepEqual(b.exhaustedCaseIds.sort(), ["T-001", "T-003"]);
});

test("同一レベルに exhausted しかなくても、そのレベルで exhausted を返す (次レベルに進まない)", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit", attempts: "3" }),
    row({ case_id: "T-002", level: "integration", attempts: "0" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "unit");
  assert.deepEqual(b.caseIds, []);
  assert.deepEqual(b.exhaustedCaseIds, ["T-001"]);
});

test("あるレベルの todo が全て終わっていれば次レベルへ", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit", status: "pass", attempts: "1" }),
    row({ case_id: "T-002", level: "integration", attempts: "0" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "integration");
  assert.deepEqual(b.caseIds, ["T-002"]);
});

test("単体が UNIT_BATCH_SIZE 未満なら残り件数ぶんだけ束ねる", () => {
  const rows = [row({ case_id: "T-001" }), row({ case_id: "T-002" })];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.caseIds.length, 2);
});

test("結合は 1 件だけ束ねる", () => {
  const rows = [
    row({ case_id: "T-001", level: "integration" }),
    row({ case_id: "T-002", level: "integration" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "integration");
  assert.equal(b.caseIds.length, 1);
});

test("E2E は 1 件だけ束ねる", () => {
  const rows = [
    row({ case_id: "T-001", level: "e2e" }),
    row({ case_id: "T-002", level: "e2e" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "e2e");
  assert.equal(b.caseIds.length, 1);
});

test("レベルをまたがない (単体を取り切るまで integration を取らない)", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit" }),
    row({ case_id: "T-002", level: "integration" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.equal(b.level, "unit");
  assert.deepEqual(b.caseIds, ["T-001"]);
});

test("attempts が maxAttempts 未満の todo だけを caseIds に入れ、それ以上を exhaustedCaseIds に入れる", () => {
  const rows = [
    row({ case_id: "T-001", attempts: "3" }),
    row({ case_id: "T-002", attempts: "0" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.deepEqual(b.caseIds, ["T-002"]);
  assert.deepEqual(b.exhaustedCaseIds, ["T-001"]);
});

test("飛び飛びに残っていても台帳の並び順で束ねる", () => {
  const rows = [
    row({ case_id: "T-001", status: "pass" }),
    row({ case_id: "T-002", status: "todo" }),
    row({ case_id: "T-003", status: "pass" }),
    row({ case_id: "T-004", status: "todo" }),
  ];
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 });
  assert.deepEqual(b.caseIds, ["T-002", "T-004"]);
});

test("未実施が無ければ null", () => {
  const rows = [row({ status: "pass" })];
  assert.equal(nextBatch(rows, { maxAttempts: 3, unitBatchSize: 10 }), null);
});

test("unitBatchSize=1 は 1 ケース 1 体になる", () => {
  const rows = Array.from({ length: 3 }, (_, i) =>
    row({ case_id: `T-${String(i + 1).padStart(3, "0")}` }),
  );
  const b = nextBatch(rows, { maxAttempts: 3, unitBatchSize: 1 });
  assert.equal(b.caseIds.length, 1);
});

test("CLI: --dir を渡すと {batch} を JSON で返す", () => {
  const root = mkdtempSync(join(tmpdir(), "batch-plan-test-"));
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  const rows = [
    { case_id: "T-001", level: "unit", status: "todo", attempts: "0" },
    { case_id: "T-002", level: "unit", status: "todo", attempts: "0" },
  ];
  writeCases(casesPath(artifact), rows);

  const r = spawnSync("node", [SCRIPT, "--dir", artifact], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const expected = nextBatch(rows);
  assert.equal(out.batch.level, expected.level);
  assert.deepEqual(out.batch.caseIds, expected.caseIds);

  rmSync(root, { recursive: true, force: true });
});
