import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkConfidenceBatches } from "./chunk-confidence-batches.mjs";

function makeTmpWorkdir(count) {
  const dir = join(tmpdir(), `chunk-conf-test-${process.pid}-${Date.now()}-${count}`);
  mkdirSync(dir, { recursive: true });
  const issues = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1).padStart(3, "0"),
    title: `issue ${i + 1}`,
  }));
  writeFileSync(`${dir}/flat-issues.json`, JSON.stringify(issues));
  return dir;
}

test("20 件ちょうどは 1 バッチ", () => {
  const dir = makeTmpWorkdir(20);
  try {
    const batches = chunkConfidenceBatches(dir, 20);
    assert.equal(batches.length, 1);
    const b0 = JSON.parse(readFileSync(batches[0], "utf8"));
    assert.equal(b0.length, 20);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("21 件は 20 + 1 の 2 バッチに分割", () => {
  const dir = makeTmpWorkdir(21);
  try {
    const batches = chunkConfidenceBatches(dir, 20);
    assert.equal(batches.length, 2);
    assert.equal(JSON.parse(readFileSync(batches[0], "utf8")).length, 20);
    assert.equal(JSON.parse(readFileSync(batches[1], "utf8")).length, 1);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("各エントリは id / issue_path / output_path を持つ", () => {
  const dir = makeTmpWorkdir(1);
  try {
    const batches = chunkConfidenceBatches(dir, 20);
    const entry = JSON.parse(readFileSync(batches[0], "utf8"))[0];
    assert.equal(entry.id, "001");
    assert.equal(entry.issue_path, `${dir}/flat-issues/001.json`);
    assert.equal(entry.output_path, `${dir}/confidence/001.json`);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("バッチファイルは confidence-batches/ に連番で書き出される", () => {
  const dir = makeTmpWorkdir(21);
  try {
    chunkConfidenceBatches(dir, 20);
    assert.ok(existsSync(`${dir}/confidence-batches/batch-001.json`));
    assert.ok(existsSync(`${dir}/confidence-batches/batch-002.json`));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issue が 0 件なら空配列を返しバッチを作らない", () => {
  const dir = makeTmpWorkdir(0);
  try {
    assert.deepEqual(chunkConfidenceBatches(dir, 20), []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("flat-issues.json が無ければ空配列", () => {
  const dir = join(tmpdir(), `chunk-conf-test-nofile-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    assert.deepEqual(chunkConfidenceBatches(dir, 20), []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
