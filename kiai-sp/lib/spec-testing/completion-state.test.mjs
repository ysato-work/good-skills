import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMPLETION_DIR_NAME,
  PHASE_BY_SKILL,
  armCompletion,
  completionPath,
  disarmCompletion,
  readCompletion,
  recordTurn,
} from "./completion-state.mjs";

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "completion-state-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("スキル名とフェーズの対応が 2 つある", () => {
  assert.deepEqual(PHASE_BY_SKILL, {
    "generating-spec-tests": "generation",
    "executing-spec-tests": "execution",
  });
});

test("completionPath はセッションごとのパスを返す", () => {
  assert.equal(completionPath("abc", "/base"), join("/base", COMPLETION_DIR_NAME, "abc.json"));
});

test("装填が無ければ readCompletion は null", () => {
  withRoot((root) => {
    assert.equal(readCompletion("nope", { root }), null);
  });
});

test("armCompletion はフェーズとカウンタの初期値を書く", () => {
  withRoot((root) => {
    const s = armCompletion("s1", { phase: "execution", now: "2026-09-01T00:00:00.000Z", root });
    assert.equal(s.phase, "execution");
    assert.equal(s.armedAt, "2026-09-01T00:00:00.000Z");
    assert.equal(s.consecutiveBlocks, 0);
    assert.equal(s.noProgressTurns, 0);
  });
});

test("2 回目の装填はフェーズを更新してカウンタを保つ", () => {
  withRoot((root) => {
    armCompletion("s1", { phase: "generation", now: "2026-09-01T00:00:00.000Z", root });
    recordTurn("s1", { blocked: true, advanced: 0, root });
    const s = armCompletion("s1", { phase: "execution", now: "2026-09-01T09:00:00.000Z", root });
    assert.equal(s.phase, "execution");
    assert.equal(s.armedAt, "2026-09-01T00:00:00.000Z", "装填時刻は最初のまま");
    assert.equal(s.consecutiveBlocks, 1, "カウンタが巻き戻っている");
  });
});

test("ブロックしたターンは両方のカウンタが進む", () => {
  withRoot((root) => {
    armCompletion("s1", { phase: "execution", root });
    const s = recordTurn("s1", { blocked: true, advanced: 0, root });
    assert.equal(s.consecutiveBlocks, 1);
    assert.equal(s.noProgressTurns, 1);
  });
});

test("前進があったターンは前進 0 のカウンタだけ戻る", () => {
  withRoot((root) => {
    armCompletion("s1", { phase: "execution", root });
    recordTurn("s1", { blocked: true, advanced: 0, root });
    const s = recordTurn("s1", { blocked: true, advanced: 2, root });
    assert.equal(s.consecutiveBlocks, 2, "ブロックは続いている");
    assert.equal(s.noProgressTurns, 0, "前進したのでリセットされる");
  });
});

test("ブロックしなかったターンは両方 0 に戻る", () => {
  withRoot((root) => {
    armCompletion("s1", { phase: "execution", root });
    recordTurn("s1", { blocked: true, advanced: 0, root });
    recordTurn("s1", { blocked: true, advanced: 0, root });
    const s = recordTurn("s1", { blocked: false, advanced: 0, root });
    assert.equal(s.consecutiveBlocks, 0);
    assert.equal(s.noProgressTurns, 0);
  });
});

test("装填が無いセッションで recordTurn を呼んでも装填されない", () => {
  withRoot((root) => {
    assert.equal(recordTurn("s1", { blocked: true, advanced: 0, root }), null);
    assert.equal(readCompletion("s1", { root }), null);
  });
});

test("disarmCompletion は装填を消す", () => {
  withRoot((root) => {
    armCompletion("s1", { phase: "execution", root });
    disarmCompletion("s1", { root });
    assert.equal(readCompletion("s1", { root }), null);
  });
});

test("壊れた state は装填されていないものとして扱う", () => {
  withRoot(async (root) => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const path = completionPath("s1", root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ こわれている", "utf8");
    assert.equal(readCompletion("s1", { root }), null);
  });
});
