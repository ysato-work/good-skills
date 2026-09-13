import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ATTEMPTS } from "../../../lib/spec-testing/constants.mjs";
import { progressLine, remainingTodo, selectNext } from "./next-case.mjs";

function row(over = {}) {
  return {
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    technique: "境界値",
    box: "white",
    title: "t",
    preconditions: "",
    steps: "",
    expected: "",
    status: "todo",
    out_of_scope_reason: "",
    attempts: "0",
    evidence_path: "",
    test_code_path: "",
    updated_at: "",
    ...over,
  };
}

test("台帳の上から最初の todo を選ぶ", () => {
  const rows = [
    row({ case_id: "T-001", status: "pass" }),
    row({ case_id: "T-002", status: "todo" }),
    row({ case_id: "T-003", status: "todo" }),
  ];
  assert.deepEqual(selectNext(rows), { index: 1, case_id: "T-002", action: "run" });
});

test("todo が無ければ null", () => {
  assert.equal(selectNext([row({ status: "pass" }), row({ case_id: "T-002", status: "fail" })]), null);
});

test("out_of_scope と error は選ばない", () => {
  const rows = [
    row({ case_id: "T-001", status: "out_of_scope", out_of_scope_reason: "外部 SaaS" }),
    row({ case_id: "T-002", status: "error" }),
  ];
  assert.equal(selectNext(rows), null);
});

test("試行上限に達している todo は起動せず exhaust を返す", () => {
  const rows = [row({ status: "todo", attempts: String(MAX_ATTEMPTS) })];
  assert.deepEqual(selectNext(rows), { index: 0, case_id: "T-001", action: "exhaust" });
});

test("試行上限の 1 つ手前ならまだ起動する", () => {
  const rows = [row({ status: "todo", attempts: String(MAX_ATTEMPTS - 1) })];
  assert.equal(selectNext(rows).action, "run");
});

test("attempts が数値として読めなければ起動しない", () => {
  const rows = [row({ status: "todo", attempts: "こわれている" })];
  assert.equal(selectNext(rows).action, "exhaust");
});

test("選択は台帳の並び順だけで決まる。level を見て並べ替えない", () => {
  const rows = [
    row({ case_id: "T-001", level: "e2e", status: "todo" }),
    row({ case_id: "T-002", level: "unit", status: "todo" }),
  ];
  assert.equal(selectNext(rows).case_id, "T-001");
});

test("remainingTodo は todo の件数を返す", () => {
  const rows = [row({ status: "todo" }), row({ case_id: "T-002", status: "todo" }), row({ case_id: "T-003", status: "pass" })];
  assert.equal(remainingTodo(rows), 2);
});

test("progressLine は親が 1 行だけ出せる要約を返す", () => {
  const rows = [
    row({ case_id: "T-001", status: "pass" }),
    row({ case_id: "T-002", status: "fail" }),
    row({ case_id: "T-003", status: "todo" }),
  ];
  assert.equal(progressLine(rows), "3 件中 2 件消化 (pass 1 / fail 1 / error 0 / out_of_scope 0)、残り todo 1 件");
});
