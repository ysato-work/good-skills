import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_CONSECUTIVE_BLOCKS, NO_PROGRESS_MAX_TURNS } from "./constants.mjs";

const BODY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "COMPLETION-GATE.md"), "utf8");

test("2 つの上限が文書とコードでずれていない", () => {
  assert.ok(BODY.includes(`${NO_PROGRESS_MAX_TURNS} ターン`), "前進 0 の上限がずれている");
  assert.ok(BODY.includes(`${MAX_CONSECUTIVE_BLOCKS} 回`), "連続ブロックの上限がずれている");
});

test("8 回で上書きされることが書いてある", () => {
  assert.match(BODY, /8 回/);
});

test("停止したときの読み方が書いてある", () => {
  assert.match(BODY, /stop-report\.json/);
});

test("ゲートを外す手順が書いてある", () => {
  assert.match(BODY, /disarm/);
});
