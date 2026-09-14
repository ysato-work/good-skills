import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { arm, readState, recordWrite, statePath } from "./gate-state.mjs";

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "gate-state-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("statePath は sessionId ごとのパスを返す", () => {
  const p = statePath("abc123", "/base");
  assert.equal(p, join("/base", "kiai-sp-gate", "abc123.json"));
});

test("装填が無ければ readState は null", () => {
  withRoot((root) => {
    assert.equal(readState("nope", { root }), null);
  });
});

test("arm は armedAt と skills を記録する", () => {
  withRoot((root) => {
    const s = arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    assert.equal(s.armedAt, "2026-08-01T00:00:00.000Z");
    assert.deepEqual(s.skills, ["brainstorming"]);
    assert.deepEqual(readState("s1", { root }), s);
  });
});

test("2 回目の arm で armedAt は上書きされない", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    const s = arm("s1", "writing-plans", { now: "2026-08-01T09:00:00.000Z", root });
    assert.equal(s.armedAt, "2026-08-01T00:00:00.000Z");
    assert.deepEqual(s.skills, ["brainstorming", "writing-plans"]);
  });
});

test("同じスキルを二重に装填しても skills は重複しない", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    const s = arm("s1", "brainstorming", { now: "2026-08-01T01:00:00.000Z", root });
    assert.deepEqual(s.skills, ["brainstorming"]);
  });
});

test("壊れた state ファイルは null として扱う", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    writeFileSync(statePath("s1", root), "{ broken");
    assert.equal(readState("s1", { root }), null);
  });
});

test("arm は空の台帳で初期化する", () => {
  withRoot((root) => {
    const s = arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    assert.deepEqual(s.writes, []);
  });
});

test("装填が無ければ recordWrite は null を返し state を作らない", () => {
  withRoot((root) => {
    assert.equal(recordWrite("nope", "/repo/docs/superpowers/specs/a-design.md", { root }), null);
    assert.equal(readState("nope", { root }), null);
  });
});

test("recordWrite は台帳にパスを追記する", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    const s = recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    assert.deepEqual(s.writes, ["/repo/docs/superpowers/specs/a-design.md"]);
    assert.deepEqual(readState("s1", { root }).writes, [
      "/repo/docs/superpowers/specs/a-design.md",
    ]);
  });
});

test("同じパスを二重に recordWrite しても台帳は重複しない", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    const s = recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    assert.deepEqual(s.writes, ["/repo/docs/superpowers/specs/a-design.md"]);
  });
});

test("recordWrite は台帳をソートして保つ", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    recordWrite("s1", "/repo/docs/superpowers/specs/b-design.md", { root });
    const s = recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    assert.deepEqual(s.writes, [
      "/repo/docs/superpowers/specs/a-design.md",
      "/repo/docs/superpowers/specs/b-design.md",
    ]);
  });
});

test("2 回目の arm でも台帳は保持される", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    const s = arm("s1", "writing-plans", { now: "2026-08-01T09:00:00.000Z", root });
    assert.deepEqual(s.writes, ["/repo/docs/superpowers/specs/a-design.md"]);
  });
});

test("persist は成功後に一時ファイルを残さない", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    recordWrite("s1", "/repo/docs/superpowers/specs/a-design.md", { root });
    const stateDir = dirname(statePath("s1", root));
    assert.deepEqual(readdirSync(stateDir), ["s1.json"]);
  });
});

test("writes を持たない旧形式の state は writes: [] として読む", () => {
  withRoot((root) => {
    arm("s1", "brainstorming", { now: "2026-08-01T00:00:00.000Z", root });
    writeFileSync(
      statePath("s1", root),
      JSON.stringify({ armedAt: "2026-08-01T00:00:00.000Z", skills: ["brainstorming"] }),
    );
    assert.deepEqual(readState("s1", { root }).writes, []);
  });
});
