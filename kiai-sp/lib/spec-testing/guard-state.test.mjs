import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { armGuard, disarmGuard, guardPath, readGuard } from "./guard-state.mjs";

const WG = "kiai-sp-worktree-guard";
const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-01T01:00:00.000Z";

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "guard-state-dirname-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("guardPath は dirName 省略で kiai-sp-testing-guard、指定でそのフォルダ名を使う", () => {
  assert.equal(guardPath("s1", "/r"), "/r/kiai-sp-testing-guard/s1.json");
  assert.equal(guardPath("s1", "/r", WG), "/r/kiai-sp-worktree-guard/s1.json");
  assert.equal(guardPath("s1", "/r", undefined), "/r/kiai-sp-testing-guard/s1.json");
});

test("dirName を渡さない既存の呼び方は今までどおり kiai-sp-testing-guard に記録する", () => {
  withRoot((root) => {
    assert.equal(readGuard("nope", { root }), null);
    assert.deepEqual(armGuard("s1", { now: T1, root }), { armedAt: T1 });
    assert.deepEqual(readGuard("s1", { root }), { armedAt: T1 });
    assert.equal(existsSync(join(root, "kiai-sp-testing-guard", "s1.json")), true);
    disarmGuard("s1", { root });
    assert.equal(readGuard("s1", { root }), null);
  });
});

test("dirName 指定で装填・読み取り・解除ができ、装填なしと別セッションは null", () => {
  withRoot((root) => {
    assert.equal(readGuard("nope", { root, dirName: WG }), null);
    armGuard("s1", { now: T1, root, dirName: WG });
    assert.deepEqual(readGuard("s1", { root, dirName: WG }), { armedAt: T1 });
    assert.equal(readGuard("s2", { root, dirName: WG }), null);
    assert.equal(existsSync(join(root, WG, "s1.json")), true);
    disarmGuard("s1", { root, dirName: WG });
    assert.equal(readGuard("s1", { root, dirName: WG }), null);
  });
});

test("dirName 指定でも 2 回目の armGuard は最初の armedAt を保つ", () => {
  withRoot((root) => {
    armGuard("s1", { now: T1, root, dirName: WG });
    assert.equal(armGuard("s1", { now: T2, root, dirName: WG }).armedAt, T1);
  });
});

test("dirName ごとに記録が分かれ、一方の装填・解除が他方に影響しない", () => {
  withRoot((root) => {
    armGuard("s1", { now: T1, root, dirName: WG });
    assert.equal(readGuard("s1", { root }), null);
    disarmGuard("s1", { root });
    assert.deepEqual(readGuard("s1", { root, dirName: WG }), { armedAt: T1 });
    rmSync(join(root, WG), { recursive: true, force: true });
    armGuard("s1", { now: T1, root });
    assert.equal(readGuard("s1", { root, dirName: WG }), null);
    armGuard("s1", { now: T1, root, dirName: WG });
    disarmGuard("s1", { root, dirName: WG });
    assert.equal(readGuard("s1", { root, dirName: WG }), null);
    assert.deepEqual(readGuard("s1", { root }), { armedAt: T1 });
  });
});
