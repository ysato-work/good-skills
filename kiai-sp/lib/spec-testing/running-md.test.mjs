import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DELIVERY_STEPS } from "./branch-plan.mjs";

const BODY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "RUNNING.md"), "utf8");

test("対話実行と CI 実行の両方の手順がある", () => {
  assert.match(BODY, /## 対話実行/);
  assert.match(BODY, /## CI 実行/);
});

test("CI 実行に必要な 3 点が書いてある", () => {
  assert.match(BODY, /--output-format json/);
  assert.match(BODY, /--allowedTools/);
  assert.match(BODY, /目標条件/);
});

test("ジョブの成否が検査スクリプトの終了コードだと書いてある", () => {
  assert.match(BODY, /check-progress\.mjs/);
  assert.match(BODY, /終了コード/);
});

test("完走の判定を CI に二重定義しないと書いてある", () => {
  assert.match(BODY, /2 箇所/);
});

test("納品の 6 手順が文書とコードでずれていない", () => {
  for (const step of DELIVERY_STEPS) {
    assert.ok(BODY.includes(step), `手順「${step}」が文書に無い`);
  }
});

test("特定のリポジトリ名やドメインが書かれていない", () => {
  assert.equal(/github\.com\/[\w-]+\/[\w-]+/.test(BODY), false, "具体的なリポジトリが書かれている");
});
