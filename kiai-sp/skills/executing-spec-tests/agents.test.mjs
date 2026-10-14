import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents", "executing-spec-tests");

const AGENTS = [
  { name: "ledger-reader", model: "haiku" },
  { name: "recovery", model: "haiku" },
  { name: "prerequisite-investigator", model: "sonnet" },
  { name: "batch-runner", model: "sonnet" },
  { name: "reflector", model: "haiku" },
  { name: "evidence-checker", model: "sonnet" },
];

for (const a of AGENTS) {
  test(`agent ${a.name} 定義が存在し model が ${a.model}`, () => {
    const path = join(AGENT_DIR, `${a.name}.md`);
    assert.equal(existsSync(path), true, `${path} が無い`);
    const src = readFileSync(path, "utf8");
    assert.match(src, new RegExp(`^name:\\s*${a.name}\\s*$`, "m"));
    assert.match(src, new RegExp(`^model:\\s*${a.model}\\s*$`, "m"));
    assert.match(src, /^description:/m);
  });
}
