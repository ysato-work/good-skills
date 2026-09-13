import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenFindings, poolFindings, readResults, writeFlat } from "./pool-findings.mjs";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "pool-findings-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function finding(over = {}) {
  return {
    axis: "feasibility",
    case_id: "T-001",
    problem: "この手順では合否が判定できない",
    suggestion: "期待結果に終了コードを書く",
    ...over,
  };
}

test("readResults はラベルごとの出力を読み、無いものは空配列にする", () => {
  withDir((dir) => {
    mkdirSync(join(dir, "results"), { recursive: true });
    writeFileSync(join(dir, "results", "chunk-001.json"), JSON.stringify([finding()]), "utf8");
    const results = readResults(dir, ["chunk-001", "whole"]);
    assert.equal(results["chunk-001"].length, 1);
    assert.deepEqual(results.whole, []);
  });
});

test("readResults は壊れた JSON を空配列にせず throw する", () => {
  withDir((dir) => {
    mkdirSync(join(dir, "results"), { recursive: true });
    writeFileSync(join(dir, "results", "chunk-001.json"), "{ こわれている", "utf8");
    assert.throws(() => readResults(dir, ["chunk-001"]), /chunk-001/);
  });
});

test("poolFindings は ref を label と連番で振る", () => {
  const pooled = poolFindings({
    "chunk-001": [finding(), finding({ case_id: "T-002" })],
    whole: [finding({ axis: "coverage" })],
  });
  assert.deepEqual(
    pooled.map((p) => p.ref),
    ["chunk-001#0", "chunk-001#1", "whole#0"],
  );
  assert.equal(pooled[0].label, "chunk-001");
});

test("flattenFindings は judge のグループから代表を選んで採番する", () => {
  const pooled = poolFindings({ "chunk-001": [finding(), finding({ problem: "同じ話" })] });
  const judge = {
    agent_total: 1,
    groups: [{ representative_ref: "chunk-001#1", agent_refs: ["chunk-001#0", "chunk-001#1"] }],
  };
  const flat = flattenFindings(pooled, judge);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].id, "F-001");
  assert.equal(flat[0].problem, "同じ話");
  assert.deepEqual(flat[0].agent_refs, ["chunk-001#0", "chunk-001#1"]);
  assert.equal(flat[0].agent_count, 2);
});

test("flattenFindings は指摘が 1 件も無いグループ列を空配列にする", () => {
  assert.deepEqual(flattenFindings([], { agent_total: 3, groups: [] }), []);
});

test("flattenFindings は judge が読めなければ throw する", () => {
  assert.throws(() => flattenFindings([], null), /judge の出力が読めない/);
});

test("flattenFindings は知らない ref を throw する", () => {
  const pooled = poolFindings({ "chunk-001": [finding()] });
  const judge = { agent_total: 1, groups: [{ representative_ref: "chunk-009#3", agent_refs: ["chunk-009#3"] }] };
  assert.throws(() => flattenFindings(pooled, judge), /chunk-009#3/);
});

test("writeFlat は一覧と個別ファイルの両方を書く", () => {
  withDir((dir) => {
    const pooled = poolFindings({ "chunk-001": [finding()] });
    const flat = flattenFindings(pooled, {
      agent_total: 1,
      groups: [{ representative_ref: "chunk-001#0", agent_refs: ["chunk-001#0"] }],
    });
    writeFlat(dir, flat);

    const all = JSON.parse(readFileSync(join(dir, "flat-issues.json"), "utf8"));
    assert.equal(all[0].id, "F-001");
    const one = JSON.parse(readFileSync(join(dir, "flat-issues", "F-001.json"), "utf8"));
    assert.equal(one.id, "F-001");
  });
});
