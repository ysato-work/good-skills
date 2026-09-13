import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_SCORE_ATTEMPTS,
  assertThreshold,
  collectScores,
  partitionByThreshold,
  runScore,
} from "./score.mjs";

function withWorkdir(flat, confidences, fn) {
  const dir = mkdtempSync(join(tmpdir(), "score-"));
  try {
    writeFileSync(join(dir, "flat-issues.json"), JSON.stringify(flat), "utf8");
    mkdirSync(join(dir, "confidence"), { recursive: true });
    for (const [id, value] of Object.entries(confidences)) {
      writeFileSync(
        join(dir, "confidence", `${id}.json`),
        JSON.stringify({ confidence: value, confidence_plus: [], confidence_minus: [] }),
        "utf8",
      );
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FLAT = [
  { id: "F-001", problem: "a", suggestion: "x" },
  { id: "F-002", problem: "b", suggestion: "y" },
];

test("閾値は 51 未満と 99 超を受け付けない", () => {
  assert.throws(() => assertThreshold(50), /51/);
  assert.throws(() => assertThreshold(100), /99/);
  assert.doesNotThrow(() => assertThreshold(70));
});

test("50 は閾値として通らない。中間値埋めを構造的に塞ぐため", () => {
  assert.throws(() => assertThreshold(50));
});

test("collectScores は採点済みと未採点を分けて返す", () => {
  withWorkdir(FLAT, { "F-001": 80 }, (dir) => {
    const { scored, missing } = collectScores(dir, FLAT);
    assert.equal(scored.find((s) => s.id === "F-001").confidence, 80);
    assert.deepEqual(missing, ["F-002"]);
  });
});

test("partitionByThreshold は閾値で分ける", () => {
  const { passed, dropped } = partitionByThreshold(
    [
      { id: "F-001", confidence: 80 },
      { id: "F-002", confidence: 60 },
    ],
    70,
  );
  assert.deepEqual(passed.map((p) => p.id), ["F-001"]);
  assert.deepEqual(dropped.map((d) => d.id), ["F-002"]);
});

test("partitionByThreshold は未採点があれば中間値で埋めず throw する", () => {
  assert.throws(
    () => partitionByThreshold([{ id: "F-001", confidence: null }], 70),
    /F-001/,
  );
});

test("試行上限は 3 回", () => {
  assert.equal(MAX_SCORE_ATTEMPTS, 3);
});

test("未採点があり試行上限内なら再採点を促す 3 で終わる", () => {
  withWorkdir(FLAT, { "F-001": 80 }, (dir) => {
    const r = runScore({ workdir: dir, threshold: 70, attempt: 1 });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /F-002/);
  });
});

test("未採点のまま試行上限を超えたらエラーで停止する", () => {
  withWorkdir(FLAT, { "F-001": 80 }, (dir) => {
    const r = runScore({ workdir: dir, threshold: 70, attempt: 3 });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /採点できなかった/);
    assert.match(r.stderr, /F-002/);
  });
});

test("全件採点できていれば passed と dropped を書いて 0 で終わる", () => {
  withWorkdir(FLAT, { "F-001": 80, "F-002": 60 }, (dir) => {
    const r = runScore({ workdir: dir, threshold: 70, attempt: 1 });
    assert.equal(r.code, 0);
    const passed = JSON.parse(readFileSync(join(dir, "passed.json"), "utf8"));
    const dropped = JSON.parse(readFileSync(join(dir, "dropped.json"), "utf8"));
    assert.deepEqual(passed.map((p) => p.id), ["F-001"]);
    assert.deepEqual(dropped.map((d) => d.id), ["F-002"]);
  });
});

test("指摘が 0 件なら 0 で終わり passed も空になる", () => {
  withWorkdir([], {}, (dir) => {
    const r = runScore({ workdir: dir, threshold: 70, attempt: 1 });
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "passed.json"), "utf8")), []);
  });
});

test("範囲外の閾値を渡したら検査できなかったとして 2 で終わる", () => {
  withWorkdir(FLAT, { "F-001": 80, "F-002": 60 }, (dir) => {
    const r = runScore({ workdir: dir, threshold: 50, attempt: 1 });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /51/);
  });
});

test("50 埋めの語がソースのどこにも無い", async () => {
  const { readFileSync: read } = await import("node:fs");
  const { dirname, join: j } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const body = read(j(dirname(fileURLToPath(import.meta.url)), "score.mjs"), "utf8");
  assert.equal(body.includes("applyFallback"), false, "applyFallback を持ち込んでいる");
  assert.equal(/confidence\s*[:=]\s*50\b/.test(body), false, "50 埋めが残っている");
});
