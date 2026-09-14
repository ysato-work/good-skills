import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_BRANCH_PREFIX, BASH_RULES, RESOURCE_PREFIX } from "./forbidden-bash.mjs";

const BODY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TIERS.md"), "utf8");

test("3 階層すべての見出しがある", () => {
  for (const heading of ["Tier 1", "Tier 2", "Tier 3"]) {
    assert.match(BODY, new RegExp(`##.*${heading}`), `${heading} の節が無い`);
  }
});

test("接頭辞の規約がコードと同じ値で書かれている", () => {
  assert.ok(BODY.includes(RESOURCE_PREFIX), `${RESOURCE_PREFIX} が書かれていない`);
  assert.ok(BODY.includes(ALLOWED_BRANCH_PREFIX), `${ALLOWED_BRANCH_PREFIX} が書かれていない`);
});

test("すべての禁止ルールが文書に列挙されている", () => {
  for (const rule of BASH_RULES) {
    assert.ok(BODY.includes(rule.id), `禁止ルール ${rule.id} が文書に無い`);
  }
});

test("対象外に逃げるのを禁じる記述がある", () => {
  assert.match(BODY, /Tier 2 の条件を満たすのに/);
});

test("落ちるテストを緑にする細工の禁止が書かれている", () => {
  assert.match(BODY, /落ちたまま残す/);
});
