import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_CONSECUTIVE_BLOCKS, NO_PROGRESS_MAX_TURNS } from "./constants.mjs";
import { TESTING_ROOT } from "./paths.mjs";
import {
  buildStopReport,
  decide,
  isDelivered,
  mostRecentAttempt,
  renderBlock,
  renderStop,
  resolveArtifactDir,
} from "./completion-gate.mjs";

function withRepo(dirs, fn) {
  const repo = mkdtempSync(join(tmpdir(), "completion-gate-"));
  try {
    for (const [name, mtime] of dirs) {
      const dir = join(repo, TESTING_ROOT, name);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "cases.tsv");
      writeFileSync(file, "case_id\n", "utf8");
      if (mtime) utimesSync(file, mtime, mtime);
    }
    fn(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function state(over = {}) {
  return { armedAt: "2026-09-01T00:00:00.000Z", phase: "execution", consecutiveBlocks: 0, noProgressTurns: 0, ...over };
}

const PROGRESS = { total: 10, todo: 3, pass: 6, fail: 1, error: 0, out_of_scope: 0, reasons: ["todo が 3 件残っている"] };

test("成果物ディレクトリが無ければ null", () => {
  const repo = mkdtempSync(join(tmpdir(), "completion-gate-empty-"));
  try {
    assert.equal(resolveArtifactDir(repo), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("成果物ディレクトリが 1 つならそれを返す", () => {
  withRepo([["2026-08-31-x", null]], (repo) => {
    assert.equal(resolveArtifactDir(repo), join(repo, TESTING_ROOT, "2026-08-31-x"));
  });
});

test("複数あれば cases.tsv が最も新しいものを返す", () => {
  withRepo([["old", 1000], ["new", 2000]], (repo) => {
    assert.equal(resolveArtifactDir(repo), join(repo, TESTING_ROOT, "new"));
  });
});

test("cases.tsv が無いディレクトリは候補にしない", () => {
  withRepo([["real", null]], (repo) => {
    mkdirSync(join(repo, TESTING_ROOT, "empty"), { recursive: true });
    assert.equal(resolveArtifactDir(repo), join(repo, TESTING_ROOT, "real"));
  });
});

test("装填が無ければ素通しする", () => {
  assert.equal(decide({ state: null, checkCode: 1, advanced: 0, inFlight: 0 }).action, "allow");
});

test("バックグラウンド作業中は保留する", () => {
  const d = decide({ state: state(), checkCode: 1, advanced: 0, inFlight: 1 });
  assert.equal(d.action, "defer");
});

test("完了していれば素通しする", () => {
  assert.equal(decide({ state: state(), checkCode: 0, advanced: 0, inFlight: 0 }).action, "allow");
});

test("検査できなかったら止める", () => {
  const d = decide({ state: state(), checkCode: 2, advanced: 0, inFlight: 0 });
  assert.equal(d.action, "stop");
  assert.match(d.reason, /検査できなかった/);
});

test("未完で前進があればブロックする", () => {
  assert.equal(decide({ state: state(), checkCode: 1, advanced: 2, inFlight: 0 }).action, "block");
});

test("前進 0 が上限に達したらブロックをやめて止まる", () => {
  const d = decide({
    state: state({ noProgressTurns: NO_PROGRESS_MAX_TURNS - 1 }),
    checkCode: 1,
    advanced: 0,
    inFlight: 0,
  });
  assert.equal(d.action, "stop");
  assert.match(d.reason, /前進/);
});

test("前進があれば前進 0 のカウンタは効かない", () => {
  const d = decide({
    state: state({ noProgressTurns: NO_PROGRESS_MAX_TURNS - 1 }),
    checkCode: 1,
    advanced: 1,
    inFlight: 0,
  });
  assert.equal(d.action, "block");
});

test("連続ブロックが上限に達したら止まる", () => {
  const d = decide({
    state: state({ consecutiveBlocks: MAX_CONSECUTIVE_BLOCKS - 1 }),
    checkCode: 1,
    advanced: 5,
    inFlight: 0,
  });
  assert.equal(d.action, "stop");
  assert.match(d.reason, /連続/);
});

test("連続ブロックの上限は Claude Code の上書きより手前で効く", () => {
  assert.ok(MAX_CONSECUTIVE_BLOCKS < 8);
});

test("renderBlock は残件と次にやることを伝える", () => {
  const text = renderBlock(PROGRESS, "todo が 3 件残っている");
  assert.match(text, /todo が 3 件残っている/);
  assert.match(text, /10 件中/);
});

test("renderStop は失敗として読める文面にする", () => {
  const text = renderStop(PROGRESS, "前進が 3 ターン無い");
  assert.match(text, /完走できなかった/);
  assert.match(text, /前進が 3 ターン無い/);
  assert.match(text, /todo 3 件/);
});

test("buildStopReport は残件と理由と時刻を残す", () => {
  const report = buildStopReport({
    reason: "前進が 3 ターン無い",
    progress: PROGRESS,
    phase: "execution",
    now: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(report.stopped_at, "2026-09-01T00:00:00.000Z");
  assert.equal(report.phase, "execution");
  assert.equal(report.reason, "前進が 3 ターン無い");
  assert.deepEqual(report.progress, PROGRESS);
  assert.equal(report.most_recent_attempt, null);
});

test("mostRecentAttempt は updated_at が最も新しい行を返す", () => {
  const cases = [
    { case_id: "T-001", status: "pass", attempts: "1", evidence_path: "evidence/T-001/", updated_at: "2026-09-01T00:00:00.000Z" },
    { case_id: "T-002", status: "error", attempts: "3", evidence_path: "", updated_at: "2026-09-01T01:00:00.000Z" },
  ];
  const r = mostRecentAttempt(cases);
  assert.equal(r.case_id, "T-002");
  assert.equal(r.status, "error");
});

test("mostRecentAttempt は updated_at が無ければ null", () => {
  assert.equal(mostRecentAttempt([{ case_id: "T-001", status: "todo", updated_at: "" }]), null);
});

test("buildStopReport は most_recent_attempt を含む", () => {
  const report = buildStopReport({
    reason: "前進が 3 ターン無い",
    progress: PROGRESS,
    phase: "execution",
    cases: [{ case_id: "T-001", status: "error", attempts: "3", evidence_path: "evidence/T-001/", updated_at: "2026-09-01T00:00:00.000Z" }],
    now: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(report.most_recent_attempt.case_id, "T-001");
});

test("isDelivered は delivered.json の有無を見る", () => {
  withRepo([["2026-08-31-x", null]], (repo) => {
    const dir = join(repo, TESTING_ROOT, "2026-08-31-x");
    assert.equal(isDelivered(dir), false);
    writeFileSync(join(dir, "delivered.json"), "{}", "utf8");
    assert.equal(isDelivered(dir), true);
  });
});

test("実施フェーズは台帳が完了していても未納品ならブロックする", () => {
  const d = decide({ state: state({ phase: "execution" }), checkCode: 0, delivered: false });
  assert.equal(d.action, "block");
  assert.match(d.reason, /納品/);
});

test("実施フェーズは台帳が完了し納品も済んでいれば素通しする", () => {
  const d = decide({ state: state({ phase: "execution" }), checkCode: 0, delivered: true });
  assert.equal(d.action, "allow");
});

test("生成フェーズはdeliveredを見ずに台帳完了で素通しする", () => {
  const d = decide({ state: state({ phase: "generation" }), checkCode: 0, delivered: false });
  assert.equal(d.action, "allow");
});
