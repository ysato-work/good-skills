import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CASE_LOG_TOTAL_MAX_BYTES,
  CONFIDENCE_THRESHOLD,
  LOG_FILE_KEEP_BYTES,
  LOG_FILE_MAX_BYTES,
  MAX_ATTEMPTS,
  MAX_CONSECUTIVE_BLOCKS,
  NO_PROGRESS_MAX_TURNS,
  REVIEW_MAX_ROUNDS,
} from "./constants.mjs";

test("確信度の閾値は 50 より大きい", () => {
  // 採点が落ちたときの 50 埋めが素通りしないようにするための規約
  assert.ok(CONFIDENCE_THRESHOLD > 50, `閾値が ${CONFIDENCE_THRESHOLD}`);
});

test("連続ブロックの上限は 8 未満", () => {
  // 8 回連続でブロックすると Claude Code 側に上書きされてターンが終わる
  assert.ok(MAX_CONSECUTIVE_BLOCKS < 8, `上限が ${MAX_CONSECUTIVE_BLOCKS}`);
});

test("ログの先頭と末尾に残す幅の合計は 1 ファイル上限を超えない", () => {
  assert.ok(LOG_FILE_KEEP_BYTES * 2 <= LOG_FILE_MAX_BYTES);
});

test("1 ケースの合計上限は 1 ファイル上限以上", () => {
  assert.ok(CASE_LOG_TOTAL_MAX_BYTES >= LOG_FILE_MAX_BYTES);
});

test("回数系の定数は 1 以上の整数", () => {
  for (const [name, value] of [
    ["MAX_ATTEMPTS", MAX_ATTEMPTS],
    ["REVIEW_MAX_ROUNDS", REVIEW_MAX_ROUNDS],
    ["NO_PROGRESS_MAX_TURNS", NO_PROGRESS_MAX_TURNS],
  ]) {
    assert.ok(Number.isInteger(value) && value >= 1, `${name} が ${value}`);
  }
});
