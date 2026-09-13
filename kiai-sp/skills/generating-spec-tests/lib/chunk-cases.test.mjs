import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHUNK_SIZE, chunkCases, summarizeForWhole, writeBundle } from "./chunk-cases.mjs";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "chunk-cases-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeCases(n) {
  return Array.from({ length: n }, (_, i) => ({
    case_id: `T-${String(i + 1).padStart(3, "0")}`,
    level: "unit",
    req_ids: "R-001",
    title: `ケース ${i + 1}`,
    steps: "1. 呼ぶ",
    expected: "0 が返る",
    status: "todo",
  }));
}

test("チャンクサイズは 20", () => {
  assert.equal(CHUNK_SIZE, 20);
});

test("chunkCases は指定件数ずつに割る", () => {
  const chunks = chunkCases(makeCases(45));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 20);
  assert.equal(chunks[2].length, 5);
});

test("chunkCases は空配列を空のチャンク列にする", () => {
  assert.deepEqual(chunkCases([]), []);
});

test("summarizeForWhole は全体レビュア向けに列を削る", () => {
  const summary = summarizeForWhole(makeCases(1)[0]);
  assert.deepEqual(
    Object.keys(summary).sort(),
    ["case_id", "level", "out_of_scope_reason", "req_ids", "status", "title"],
  );
});

test("summarizeForWhole は対象外ケースの status と理由を含める", () => {
  const summary = summarizeForWhole({
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    title: "x",
    status: "out_of_scope",
    out_of_scope_reason: "外部 SaaS",
  });
  assert.equal(summary.status, "out_of_scope");
  assert.equal(summary.out_of_scope_reason, "外部 SaaS");
});

test("writeBundle は要件を 1 回だけ書き、チャンクと全体を並べる", () => {
  withDir((dir) => {
    const requirements = [{ req_id: "R-001", quote: "なにか", testable: "yes" }];
    const out = writeBundle(dir, { requirements, cases: makeCases(25) });

    assert.deepEqual(JSON.parse(readFileSync(out.requirementsPath, "utf8")), requirements);
    assert.equal(out.chunkPaths.length, 2);
    assert.deepEqual(out.labels, ["chunk-001", "chunk-002", "whole"]);

    const first = JSON.parse(readFileSync(out.chunkPaths[0], "utf8"));
    assert.equal(first.length, 20);
    assert.equal(first[0].steps, "1. 呼ぶ", "チャンクにはケースの実体が入る");

    const whole = JSON.parse(readFileSync(out.wholePath, "utf8"));
    assert.equal(whole.length, 25);
    assert.equal(whole[0].steps, undefined, "全体レビュア向けは要約だけ");
  });
});

test("writeBundle はケースが 0 件でも全体だけは書く", () => {
  withDir((dir) => {
    const out = writeBundle(dir, { requirements: [], cases: [] });
    assert.deepEqual(out.chunkPaths, []);
    assert.deepEqual(out.labels, ["whole"]);
    assert.deepEqual(JSON.parse(readFileSync(out.wholePath, "utf8")), []);
  });
});
