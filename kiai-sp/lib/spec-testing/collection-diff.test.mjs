import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countFromSummary,
  parseCollected,
  runCollect,
  snapshot,
  verifyNoNewCollection,
} from "./collection-diff.mjs";

test("parseCollected は 1 行 1 パスの出力を読む", () => {
  const text = "/repo/src/a.test.ts\n/repo/src/b.test.ts\n";
  assert.deepEqual(parseCollected(text), ["/repo/src/a.test.ts", "/repo/src/b.test.ts"]);
});

test("parseCollected は path::name 形式のノード名を落とす", () => {
  const text = "tests/test_a.py::test_one\ntests/test_a.py::test_two\ntests/test_b.py::test_x\n";
  assert.deepEqual(parseCollected(text), ["tests/test_a.py", "tests/test_b.py"]);
});

test("parseCollected は行番号つきのパスも読む", () => {
  assert.deepEqual(parseCollected("src/a.spec.ts:12\n"), ["src/a.spec.ts"]);
});

test("parseCollected はパスに見えない行を無視する", () => {
  const text = "Test suites collected\n/repo/src/a.test.ts\n\n=== done ===\n";
  assert.deepEqual(parseCollected(text), ["/repo/src/a.test.ts"]);
});

test("countFromSummary は件数を読む", () => {
  assert.equal(countFromSummary("collected 42 items"), 42);
  assert.equal(countFromSummary("Tests: 7 passed, 7 total"), 7);
  assert.equal(countFromSummary("なにもない"), null);
});

test("snapshot はパス一覧と件数をまとめる", () => {
  const s = snapshot("/repo/a.test.ts\n/repo/b.test.ts\n2 tests\n");
  assert.deepEqual(s.files, ["/repo/a.test.ts", "/repo/b.test.ts"]);
  assert.equal(s.count, 2);
});

test("収集対象が変わっていなければ ok", () => {
  const before = snapshot("/repo/a.test.ts\n");
  const after = snapshot("/repo/a.test.ts\n");
  const r = verifyNoNewCollection(before, after);
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, []);
});

test("収集対象が増えていれば ok でなく、増えたパスを返す", () => {
  const before = snapshot("/repo/a.test.ts\n");
  const after = snapshot("/repo/a.test.ts\n/repo/integration/b.itest.ts\n");
  const r = verifyNoNewCollection(before, after);
  assert.equal(r.ok, false);
  assert.deepEqual(r.added, ["/repo/integration/b.itest.ts"]);
  assert.match(r.reason, /収集対象が増えている/);
});

test("収集対象が減っていても ok でない", () => {
  const before = snapshot("/repo/a.test.ts\n/repo/b.test.ts\n");
  const after = snapshot("/repo/a.test.ts\n");
  const r = verifyNoNewCollection(before, after);
  assert.equal(r.ok, false);
  assert.deepEqual(r.removed, ["/repo/b.test.ts"]);
});

test("パスが取れないランナーでは件数で比べる", () => {
  const before = snapshot("collected 10 items\n");
  const after = snapshot("collected 12 items\n");
  const r = verifyNoNewCollection(before, after);
  assert.equal(r.ok, false);
  assert.match(r.reason, /件数が 10 から 12 に増えている/);
});

test("パスも件数も取れなければ ok にしない", () => {
  const r = verifyNoNewCollection(snapshot("???"), snapshot("???"));
  assert.equal(r.ok, false);
  assert.match(r.reason, /比較できなかった/);
});

test("runCollect は注入した spawn を使って結果を返す", () => {
  const calls = [];
  const fakeSpawn = (file, args, opts) => {
    calls.push({ file, args, cwd: opts.cwd });
    return { status: 0, stdout: "/repo/a.test.ts\n", stderr: "" };
  };
  const r = runCollect("npx jest --listTests", { cwd: "/repo", spawn: fakeSpawn });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "/repo/a.test.ts\n");
  assert.equal(calls[0].cwd, "/repo");
});
