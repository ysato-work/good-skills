import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_CONSECUTIVE_BLOCKS } from "./constants.mjs";
import { writeCases, writeRequirements } from "./ledger.mjs";
import { TESTING_ROOT, casesPath, requirementsPath } from "./paths.mjs";
import { armCompletion, readCompletion } from "./completion-state.mjs";
import { handleArm, handleVerify, inFlightCount } from "./completion-hook.mjs";

function aCase(over = {}) {
  return {
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    technique: "境界値",
    box: "white",
    title: "t",
    preconditions: "",
    steps: "",
    expected: "",
    status: "todo",
    out_of_scope_reason: "",
    attempts: "0",
    evidence_path: "",
    test_code_path: "",
    updated_at: "",
    ...over,
  };
}

const REQ = [{ req_id: "R-001", spec_section: "決定事項", quote: "q", testable: "yes", untestable_reason: "" }];

function withSession(cases, fn) {
  const root = mkdtempSync(join(tmpdir(), "completion-hook-root-"));
  const repo = mkdtempSync(join(tmpdir(), "completion-hook-repo-"));
  try {
    const dir = join(repo, TESTING_ROOT, "2026-08-31-x");
    mkdirSync(dir, { recursive: true });
    writeCases(casesPath(dir), cases);
    writeRequirements(requirementsPath(dir), REQ);
    fn({ root, repo, dir });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
}

test("テストスキルの起動でゲートが装填され、フェーズがスキル名から決まる", () => {
  withSession([aCase()], ({ root }) => {
    handleArm({ session_id: "s1", tool_input: { skill: "kiai-sp:executing-spec-tests" } }, { root });
    assert.equal(readCompletion("s1", { root }).phase, "execution");

    handleArm({ session_id: "s2", tool_input: { skill: "kiai-sp:generating-spec-tests" } }, { root });
    assert.equal(readCompletion("s2", { root }).phase, "generation");
  });
});

test("他プラグインの同名スキルでは装填しない", () => {
  withSession([aCase()], ({ root }) => {
    handleArm({ session_id: "s1", tool_input: { skill: "other:executing-spec-tests" } }, { root });
    assert.equal(readCompletion("s1", { root }), null);
  });
});

test("関係ないスキルでは装填しない", () => {
  withSession([aCase()], ({ root }) => {
    handleArm({ session_id: "s1", tool_input: { skill: "kiai-sp:brainstorming" } }, { root });
    assert.equal(readCompletion("s1", { root }), null);
  });
});

test("inFlightCount は background_tasks の件数を返す", () => {
  assert.equal(inFlightCount({ background_tasks: [1, 2] }), 2);
  assert.equal(inFlightCount({}), 0);
  assert.equal(inFlightCount({ background_tasks: "こわれている" }), 0);
});

test("装填が無ければ何も返さない", () => {
  withSession([aCase()], ({ root, repo }) => {
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  });
});

test("todo が残っていればブロックする", () => {
  withSession([aCase({ status: "todo" })], ({ root, repo }) => {
    armCompletion("s1", { phase: "execution", root });
    const out = handleVerify({ session_id: "s1", cwd: repo }, { root });
    assert.equal(out.decision, "block");
    assert.match(out.reason, /完走していない/);
  });
});

test("todo が 0 なら fail が残っていてもブロックしない（納品済み）", () => {
  withSession([aCase({ status: "fail" })], ({ root, repo, dir }) => {
    armCompletion("s1", { phase: "execution", root });
    writeFileSync(join(dir, "delivered.json"), "{}", "utf8");
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  });
});

test("実施フェーズでは被覆されていない要件があってもブロックしない（納品済み）", () => {
  withSession([aCase({ status: "pass", req_ids: "R-999" })], ({ root, repo, dir }) => {
    armCompletion("s1", { phase: "execution", root });
    writeFileSync(join(dir, "delivered.json"), "{}", "utf8");
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  });
});

test("実施フェーズは台帳が完了していても delivered.json が無ければブロックし続け、書けば通る", () => {
  withSession([aCase({ status: "pass" })], ({ root, repo, dir }) => {
    armCompletion("s1", { phase: "execution", root });
    const blocked = handleVerify({ session_id: "s1", cwd: repo }, { root });
    assert.equal(blocked.decision, "block");
    assert.match(blocked.reason, /納品/);

    writeFileSync(join(dir, "delivered.json"), "{}", "utf8");
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  });
});

test("生成フェーズでは被覆されていない要件があるとブロックする", () => {
  withSession([aCase({ status: "todo", req_ids: "R-999" })], ({ root, repo }) => {
    armCompletion("s1", { phase: "generation", root });
    const out = handleVerify({ session_id: "s1", cwd: repo }, { root });
    assert.equal(out.decision, "block");
  });
});

test("バックグラウンド作業中はブロックせず保留を伝える", () => {
  withSession([aCase({ status: "todo" })], ({ root, repo }) => {
    armCompletion("s1", { phase: "execution", root });
    const out = handleVerify({ session_id: "s1", cwd: repo, background_tasks: [1] }, { root });
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage, /保留/);
  });
});

test("連続ブロックが上限に達したら降りて停止報告を残す", () => {
  withSession([aCase({ status: "todo" })], ({ root, repo, dir }) => {
    armCompletion("s1", { phase: "execution", root });
    let out = null;
    for (let i = 0; i < MAX_CONSECUTIVE_BLOCKS + 1; i += 1) {
      out = handleVerify({ session_id: "s1", cwd: repo }, { root });
      if (out?.decision !== "block") break;
    }
    assert.equal(out.decision, undefined, "上限を超えてもブロックし続けている");
    assert.match(out.systemMessage, /完走できなかった/);

    const report = JSON.parse(readFileSync(join(dir, "stop-report.json"), "utf8"));
    assert.equal(report.phase, "execution");
    assert.equal(report.progress.todo, 1);
    assert.ok(report.reason.length > 0);
  });
});

test("停止報告には直近の試行内容が入る", () => {
  withSession([aCase({ status: "todo", attempts: "2", updated_at: "2026-09-01T00:00:00.000Z" })], ({ root, repo, dir }) => {
    armCompletion("s1", { phase: "execution", root });
    let out = null;
    for (let i = 0; i < MAX_CONSECUTIVE_BLOCKS + 1; i += 1) {
      out = handleVerify({ session_id: "s1", cwd: repo }, { root });
      if (out?.decision !== "block") break;
    }
    assert.equal(out.decision, undefined);

    const report = JSON.parse(readFileSync(join(dir, "stop-report.json"), "utf8"));
    assert.equal(report.most_recent_attempt.case_id, "T-001");
    assert.equal(report.most_recent_attempt.attempts, "2");
  });
});

test("成果物ディレクトリが見つからなければブロックしない", () => {
  const root = mkdtempSync(join(tmpdir(), "completion-hook-noart-"));
  const repo = mkdtempSync(join(tmpdir(), "completion-hook-norepo-"));
  try {
    armCompletion("s1", { phase: "execution", root });
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("停止したあとは装填が消えて、次のターンで蒸し返さない", () => {
  withSession([aCase({ status: "todo" })], ({ root, repo }) => {
    armCompletion("s1", { phase: "execution", root });
    for (let i = 0; i < MAX_CONSECUTIVE_BLOCKS + 1; i += 1) {
      const out = handleVerify({ session_id: "s1", cwd: repo }, { root });
      if (out?.decision !== "block") break;
    }
    assert.equal(readCompletion("s1", { root }), null);
    assert.equal(handleVerify({ session_id: "s1", cwd: repo }, { root }), null);
  });
});
