import assert from "node:assert/strict";
import { test } from "node:test";
import { currentLevel, levelFinished, levelRuns, needsEnvironment } from "./level-plan.mjs";

function row(over = {}) {
  return { case_id: "T-001", level: "unit", status: "todo", ...over };
}

test("unit は環境を立てない", () => {
  assert.equal(needsEnvironment("unit"), false);
});

test("integration と e2e は環境を立てる", () => {
  assert.equal(needsEnvironment("integration"), true);
  assert.equal(needsEnvironment("e2e"), true);
});

test("levelRuns は unit -> integration -> e2e の順で件数を返す", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit", status: "pass" }),
    row({ case_id: "T-002", level: "unit", status: "todo" }),
    row({ case_id: "T-003", level: "e2e", status: "todo" }),
  ];
  assert.deepEqual(levelRuns(rows), [
    { level: "unit", total: 2, todo: 1, needsEnvironment: false },
    { level: "e2e", total: 1, todo: 1, needsEnvironment: true },
  ]);
});

test("levelRuns は 1 件も無いレベルを含めない", () => {
  assert.deepEqual(levelRuns([row({ level: "unit" })]).map((r) => r.level), ["unit"]);
});

test("currentLevel は次に消化する行のレベルを返す", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit", status: "pass" }),
    row({ case_id: "T-002", level: "integration", status: "todo" }),
  ];
  assert.equal(currentLevel(rows), "integration");
});

test("currentLevel は todo が無ければ null", () => {
  assert.equal(currentLevel([row({ status: "pass" })]), null);
});

test("levelFinished はそのレベルの todo が尽きたかを返す", () => {
  const rows = [
    row({ case_id: "T-001", level: "unit", status: "pass" }),
    row({ case_id: "T-002", level: "e2e", status: "todo" }),
  ];
  assert.equal(levelFinished(rows, "unit"), true);
  assert.equal(levelFinished(rows, "e2e"), false);
});

test("levelFinished は 1 件も無いレベルを終わったものとして扱う", () => {
  assert.equal(levelFinished([row({ level: "unit" })], "integration"), true);
});
