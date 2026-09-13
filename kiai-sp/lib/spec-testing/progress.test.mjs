import assert from "node:assert/strict";
import { test } from "node:test";
import { PHASES, computeProgress } from "./progress.mjs";

function aCase(over = {}) {
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

function aReq(over = {}) {
  return {
    req_id: "R-001",
    spec_section: "決定事項",
    quote: "なにか",
    testable: "yes",
    untestable_reason: "",
    ...over,
  };
}

test("PHASES は生成と実施の 2 つ", () => {
  assert.deepEqual(PHASES, ["generation", "execution"]);
});

test("知らないフェーズは拒否する", () => {
  assert.throws(
    () => computeProgress({ cases: [], requirements: [], phase: "unknown" }),
    /phase は/,
  );
});

test("status ごとに件数を数える", () => {
  const cases = [
    aCase({ case_id: "T-001", status: "pass" }),
    aCase({ case_id: "T-002", status: "fail" }),
    aCase({ case_id: "T-003", status: "todo" }),
    aCase({ case_id: "T-004", status: "out_of_scope", out_of_scope_reason: "外部 SaaS" }),
    aCase({ case_id: "T-005", status: "error" }),
  ];
  const p = computeProgress({ cases, requirements: [aReq()], phase: "execution" });
  assert.equal(p.total, 5);
  assert.equal(p.pass, 1);
  assert.equal(p.fail, 1);
  assert.equal(p.todo, 1);
  assert.equal(p.out_of_scope, 1);
  assert.equal(p.error, 1);
});

test("1 件もケースが紐づかない要件を uncovered_req_ids に出す", () => {
  const p = computeProgress({
    cases: [aCase({ req_ids: "R-001" })],
    requirements: [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" })],
    phase: "generation",
  });
  assert.deepEqual(p.uncovered_req_ids, ["R-002"]);
});

test("testable が no の要件は uncovered_req_ids に入らない", () => {
  const p = computeProgress({
    cases: [aCase({ req_ids: "R-001" })],
    requirements: [
      aReq({ req_id: "R-001" }),
      aReq({ req_id: "R-002", testable: "no", untestable_reason: "実機必須" }),
    ],
    phase: "generation",
  });
  assert.deepEqual(p.uncovered_req_ids, []);
  assert.equal(p.done, true);
});

test("生成フェーズは被覆が埋まっていれば todo が残っていても完了", () => {
  const p = computeProgress({
    cases: [aCase({ status: "todo", req_ids: "R-001" })],
    requirements: [aReq({ req_id: "R-001" })],
    phase: "generation",
  });
  assert.equal(p.done, true);
});

test("生成フェーズは要件が 1 件も無ければ完了にしない", () => {
  const p = computeProgress({ cases: [], requirements: [], phase: "generation" });
  assert.equal(p.done, false);
  assert.match(p.reasons.join("\n"), /要件が 1 件も無い/);
});

test("実施フェーズは todo が残っていれば未完で、理由に件数が出る", () => {
  const p = computeProgress({
    cases: [aCase({ case_id: "T-001", status: "todo" }), aCase({ case_id: "T-002", status: "todo" })],
    requirements: [aReq()],
    phase: "execution",
  });
  assert.equal(p.done, false);
  assert.match(p.reasons.join("\n"), /todo が 2 件残っている/);
});

test("実施フェーズは todo が 0 なら被覆漏れがあっても完了", () => {
  const p = computeProgress({
    cases: [aCase({ status: "pass", req_ids: "R-001" })],
    requirements: [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" })],
    phase: "execution",
  });
  assert.deepEqual(p.uncovered_req_ids, ["R-002"]);
  assert.equal(p.done, true);
});

test("実施フェーズは fail が残っていても完了", () => {
  const p = computeProgress({
    cases: [aCase({ status: "fail" })],
    requirements: [aReq()],
    phase: "execution",
  });
  assert.equal(p.done, true);
});

test("実施フェーズはケースが 1 件も無ければ完了にしない", () => {
  const p = computeProgress({ cases: [], requirements: [aReq()], phase: "execution" });
  assert.equal(p.done, false);
  assert.match(p.reasons.join("\n"), /テストケースが 1 件も無い/);
});

test("前ターンから todo が減っていれば advanced_this_turn に差が入る", () => {
  const p = computeProgress({
    cases: [aCase({ case_id: "T-001", status: "pass" }), aCase({ case_id: "T-002", status: "todo" })],
    requirements: [aReq()],
    prev: { todo: 2 },
    phase: "execution",
  });
  assert.equal(p.advanced_this_turn, 1);
});

test("前ターンから todo が減っていなければ advanced_this_turn は 0", () => {
  const p = computeProgress({
    cases: [aCase({ status: "todo" })],
    requirements: [aReq()],
    prev: { todo: 1 },
    phase: "execution",
  });
  assert.equal(p.advanced_this_turn, 0);
});

test("前ターンの集計が無い初回は advanced_this_turn を 0 にする", () => {
  const p = computeProgress({
    cases: [aCase({ status: "todo" })],
    requirements: [aReq()],
    prev: null,
    phase: "execution",
  });
  assert.equal(p.advanced_this_turn, 0);
});

test("前ターンの集計が壊れていても落ちずに 0 にする", () => {
  const p = computeProgress({
    cases: [aCase({ status: "todo" })],
    requirements: [aReq()],
    prev: { todo: "こわれている" },
    phase: "execution",
  });
  assert.equal(p.advanced_this_turn, 0);
});

test("req_ids は複数の要件を被覆できる", () => {
  const p = computeProgress({
    cases: [aCase({ req_ids: "R-001,R-002" })],
    requirements: [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" })],
    phase: "generation",
  });
  assert.deepEqual(p.uncovered_req_ids, []);
});
