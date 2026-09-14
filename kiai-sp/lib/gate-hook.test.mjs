import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState } from "./gate-state.mjs";
import { PLAN_CHECKS, SPEC_CHECKS, writeRecord } from "./review-record.mjs";
import {
  armSkillNameOf,
  handleArm,
  handleRecord,
  handleVerify,
  inFlightCount,
  renderDeferral,
  skillNameOf,
} from "./gate-hook.mjs";

function withEnv(fn) {
  const root = mkdtempSync(join(tmpdir(), "gate-hook-state-"));
  const cwd = mkdtempSync(join(tmpdir(), "gate-hook-repo-"));
  mkdirSync(join(cwd, "docs/superpowers/specs"), { recursive: true });
  mkdirSync(join(cwd, "docs/superpowers/plans"), { recursive: true });
  try {
    fn({ root, cwd });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}

function input(skill, { cwd = "/tmp", sessionId = "s1" } = {}) {
  return { session_id: sessionId, cwd, tool_input: { skill } };
}

function writeInput(cwd, filePath, { tool = "Write", sessionId = "s1" } = {}) {
  return { session_id: sessionId, cwd, tool_name: tool, tool_input: { file_path: filePath } };
}

test("skillNameOf はプラグイン接頭辞を落とす", () => {
  assert.equal(skillNameOf(input("superpowers:brainstorming")), "brainstorming");
  assert.equal(skillNameOf(input("brainstorming")), "brainstorming");
  assert.equal(skillNameOf({}), "");
});

test("armSkillNameOf は kiai-sp: 接頭辞必須で、他は空文字", () => {
  assert.equal(armSkillNameOf(input("kiai-sp:brainstorming")), "brainstorming");
  assert.equal(armSkillNameOf(input("kiai-sp:writing-plans")), "writing-plans");
  assert.equal(armSkillNameOf(input("superpowers:brainstorming")), "");
  assert.equal(armSkillNameOf(input("brainstorming")), "");
  assert.equal(armSkillNameOf({}), "");
});

test("kiai-sp:brainstorming の起動で装填され、出力は無い", () => {
  withEnv(({ root, cwd }) => {
    const out = handleArm(input("kiai-sp:brainstorming", { cwd }), {
      root,
      now: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(out, null);
    assert.equal(readState("s1", { root }).armedAt, "2026-08-01T00:00:00.000Z");
  });
});

test("superpowers:brainstorming の起動では装填されない（他プラグインの同名スキル）", () => {
  withEnv(({ root, cwd }) => {
    const out = handleArm(input("superpowers:brainstorming", { cwd }), {
      root,
      now: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(out, null);
    assert.equal(readState("s1", { root }), null);
  });
});

test("接頭辞無しの brainstorming の起動でも装填されない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("brainstorming", { cwd }), { root, now: "2026-08-01T00:00:00.000Z" });
    assert.equal(readState("s1", { root }), null);
  });
});

test("装填が無いセッションで実装スキルを起動しても通す", () => {
  withEnv(({ root, cwd }) => {
    const out = handleArm(input("superpowers:subagent-driven-development", { cwd }), { root });
    assert.equal(out, null);
  });
});

test("記録の無い plan があれば実装スキルを deny する", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:writing-plans", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/plans/a.md");
    writeFileSync(target, "plan body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleArm(input("superpowers:subagent-driven-development", { cwd }), { root });
    assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /記録が無い/);
  });
});

test("plan に記録が揃っていれば実装スキルを通す", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:writing-plans", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/plans/a.md");
    writeFileSync(target, "plan body");
    handleRecord(writeInput(cwd, target), { root });
    writeRecord(target, {
      skill: "writing-plans",
      checks: PLAN_CHECKS.map((item) => ({ item, finding: "問題なし" })),
      reviewer: { status: "approved", issues: [] },
    });
    assert.equal(handleArm(input("superpowers:subagent-driven-development", { cwd }), { root }), null);
  });
});

test("記録の無い spec があっても実装スキルの deny 判定は plan だけを見る", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    assert.equal(handleArm(input("superpowers:subagent-driven-development", { cwd }), { root }), null);
  });
});

test("装填が無ければ handleVerify は何もしない", () => {
  withEnv(({ root, cwd }) => {
    assert.equal(handleVerify({ session_id: "none", cwd }, { root }), null);
  });
});

test("記録が欠けていれば handleVerify は block を返す", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleVerify({ session_id: "s1", cwd }, { root });
    assert.equal(out.decision, "block");
    assert.match(out.reason, /a-design\.md/);
  });
});

test("記録が揃っていれば handleVerify は何もしない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    writeRecord(target, {
      skill: "brainstorming",
      checks: SPEC_CHECKS.map((item) => ({ item, finding: "問題なし" })),
      reviewer: { status: "approved", issues: [] },
    });
    assert.equal(handleVerify({ session_id: "s1", cwd }, { root }), null);
  });
});

test("brainstorming から writing-plans に進んでも spec が検証対象に残る", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    handleArm(input("kiai-sp:writing-plans", { cwd }), { root, now: "2026-06-01T00:00:00.000Z" });
    const out = handleVerify({ session_id: "s1", cwd }, { root });
    assert.equal(out.decision, "block");
    assert.match(out.reason, /a-design\.md/);
  });
});

function bgTasks(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `task-${i}`,
    type: "subagent",
    status: "running",
    description: "plan document reviewer",
  }));
}

test("inFlightCount は配列以外と未定義を 0 として扱う", () => {
  assert.equal(inFlightCount({ background_tasks: bgTasks(2) }), 2);
  assert.equal(inFlightCount({ background_tasks: [] }), 0);
  assert.equal(inFlightCount({}), 0);
  assert.equal(inFlightCount({ background_tasks: "1" }), 0);
  assert.equal(inFlightCount({ background_tasks: { length: 3 } }), 0);
  assert.equal(inFlightCount(null), 0);
});

test("renderDeferral は 1 行で未記録ファイルの basename を列挙する", () => {
  const out = renderDeferral([
    { target: "/repo/docs/superpowers/specs/a-design.md", reason: "レビュー記録が無い" },
    { target: "/repo/docs/superpowers/plans/b.md", reason: "レビュー記録が無い" },
  ]);
  assert.equal(out.includes("\n"), false);
  assert.match(out, /バックグラウンド待ち/);
  assert.match(out, /a-design\.md, b\.md/);
});

test("記録が揃っていればバックグラウンド作業があっても何も返さない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    writeRecord(target, {
      skill: "brainstorming",
      checks: SPEC_CHECKS.map((item) => ({ item, finding: "問題なし" })),
      reviewer: { status: "approved", issues: [] },
    });
    const out = handleVerify({ session_id: "s1", cwd, background_tasks: bgTasks(1) }, { root });
    assert.equal(out, null);
  });
});

test("記録が欠けていてもバックグラウンド作業があれば block せず警告だけ返す", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleVerify({ session_id: "s1", cwd, background_tasks: bgTasks(1) }, { root });
    assert.equal(out.decision, undefined);
    assert.equal(out.continue, undefined);
    assert.match(out.systemMessage, /a-design\.md/);
  });
});

test("background_tasks が空配列なら従来どおり block し警告は返さない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleVerify({ session_id: "s1", cwd, background_tasks: [] }, { root });
    assert.equal(out.decision, "block");
    assert.equal(out.systemMessage, undefined);
  });
});

test("background_tasks フィールドが無ければ従来どおり block し警告は返さない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleVerify({ session_id: "s1", cwd }, { root });
    assert.equal(out.decision, "block");
    assert.equal(out.systemMessage, undefined);
  });
});

test("background_tasks が配列でなければ fail closed で block する", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    writeFileSync(target, "spec body");
    handleRecord(writeInput(cwd, target), { root });
    const out = handleVerify({ session_id: "s1", cwd, background_tasks: "running" }, { root });
    assert.equal(out.decision, "block");
    assert.equal(out.systemMessage, undefined);
  });
});

test("handleRecord は spec の書き込みを台帳に載せる", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    assert.equal(handleRecord(writeInput(cwd, target), { root }), null);
    assert.deepEqual(readState("s1", { root }).writes, [target]);
  });
});

test("handleRecord は Edit も記録する", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/plans/a.md");
    handleRecord(writeInput(cwd, target, { tool: "Edit" }), { root });
    assert.deepEqual(readState("s1", { root }).writes, [target]);
  });
});

test("handleRecord は相対パスを cwd 基準で絶対パスにする", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    handleRecord(writeInput(cwd, "docs/superpowers/specs/a-design.md"), { root });
    assert.deepEqual(readState("s1", { root }).writes, [
      join(cwd, "docs/superpowers/specs/a-design.md"),
    ]);
  });
});

test("handleRecord は Write / Edit 以外のツールを無視する", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    for (const tool of ["Read", "Bash", "NotebookEdit"]) {
      handleRecord(writeInput(cwd, target, { tool }), { root });
    }
    // tool_name が無い入力（undefined）も無視する。writeInput の { tool = "Write" }
    // 既定値は明示的な undefined でも発火するため、ここだけは生のオブジェクトで送る。
    handleRecord({ session_id: "s1", cwd, tool_input: { file_path: target } }, { root });
    assert.deepEqual(readState("s1", { root }).writes, []);
  });
});

test("handleRecord は対象外のパスを無視する", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    handleRecord(writeInput(cwd, join(cwd, "README.md")), { root });
    handleRecord(writeInput(cwd, join(cwd, "docs/superpowers/specs/sub/a-design.md")), { root });
    assert.deepEqual(readState("s1", { root }).writes, []);
  });
});

test("handleRecord は file_path が無い入力で例外にならない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    assert.equal(handleRecord({ session_id: "s1", cwd, tool_name: "Write" }, { root }), null);
    assert.equal(handleRecord({}, { root }), null);
    assert.deepEqual(readState("s1", { root }).writes, []);
  });
});

test("装填されていないセッションの handleRecord は state を作らない", () => {
  withEnv(({ root, cwd }) => {
    const target = join(cwd, "docs/superpowers/specs/a-design.md");
    assert.equal(handleRecord(writeInput(cwd, target, { sessionId: "none" }), { root }), null);
    assert.equal(readState("none", { root }), null);
  });
});

test("台帳に無い spec は作業ツリーに存在しても block しない（他エージェントの成果物）", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:brainstorming", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    // 並行する別セッションが書いた spec を模す。台帳には載せない。
    writeFileSync(join(cwd, "docs/superpowers/specs/other-design.md"), "他セッションの成果物");
    assert.equal(handleVerify({ session_id: "s1", cwd }, { root }), null);
  });
});

test("台帳に無い plan は実装スキルの deny 判定に影響しない", () => {
  withEnv(({ root, cwd }) => {
    handleArm(input("kiai-sp:writing-plans", { cwd }), { root, now: "2026-01-01T00:00:00.000Z" });
    writeFileSync(join(cwd, "docs/superpowers/plans/other.md"), "他セッションの成果物");
    assert.equal(handleArm(input("superpowers:subagent-driven-development", { cwd }), { root }), null);
  });
});
