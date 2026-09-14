import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { armGuard, disarmGuard, readGuard } from "./guard-state.mjs";
import { GUARDED_TOOLS, TESTING_SKILLS, handleGuard } from "./guard-hook.mjs";

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "spec-testing-guard-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("装填が無ければ readGuard は null", () => {
  withRoot((root) => {
    assert.equal(readGuard("nope", { root }), null);
  });
});

test("armGuard は装填時刻を記録し、2 回目でも上書きしない", () => {
  withRoot((root) => {
    const first = armGuard("s1", { now: "2026-09-01T00:00:00.000Z", root });
    const second = armGuard("s1", { now: "2026-09-01T01:00:00.000Z", root });
    assert.equal(first.armedAt, "2026-09-01T00:00:00.000Z");
    assert.equal(second.armedAt, "2026-09-01T00:00:00.000Z");
  });
});

test("disarmGuard は装填を消す", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    disarmGuard("s1", { root });
    assert.equal(readGuard("s1", { root }), null);
  });
});

test("テストスキルの起動でガードが装填される", () => {
  withRoot((root) => {
    const out = handleGuard(
      { session_id: "s1", tool_name: "Skill", tool_input: { skill: `kiai-sp:${TESTING_SKILLS[0]}` } },
      { root },
    );
    assert.equal(out, null);
    assert.notEqual(readGuard("s1", { root }), null);
  });
});

test("他プラグインの同名スキルでは装填しない", () => {
  withRoot((root) => {
    handleGuard(
      { session_id: "s1", tool_name: "Skill", tool_input: { skill: `other:${TESTING_SKILLS[0]}` } },
      { root },
    );
    assert.equal(readGuard("s1", { root }), null);
  });
});

test("装填が無いセッションでは危険なコマンドも素通しする", () => {
  withRoot((root) => {
    const out = handleGuard(
      { session_id: "s1", tool_name: "Bash", tool_input: { command: "git push --force origin main" } },
      { root },
    );
    assert.equal(out, null);
  });
});

test("装填後は禁止コマンドを deny する", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const out = handleGuard(
      { session_id: "s1", tool_name: "Bash", tool_input: { command: "git push --force origin main" } },
      { root },
    );
    assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /force-push/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /force push は禁止/);
  });
});

test("装填後でも許されたコマンドは通す", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const out = handleGuard(
      { session_id: "s1", tool_name: "Bash", tool_input: { command: "npm test" } },
      { root },
    );
    assert.equal(out, null);
  });
});

test("装填後は CI 設定への Write を deny する", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const out = handleGuard(
      {
        session_id: "s1",
        tool_name: "Write",
        tool_input: { file_path: ".github/workflows/ci.yml", content: "on: push" },
      },
      { root },
    );
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /ci-config/);
  });
});

test("装填後は Edit でのスキップ追加を deny する", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const out = handleGuard(
      {
        session_id: "s1",
        tool_name: "Edit",
        tool_input: {
          file_path: "src/foo.test.ts",
          old_string: "it('x'",
          new_string: "it.skip('x'",
        },
      },
      { root },
    );
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /add-skip/);
  });
});

test("見張らないツールには何もしない", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    assert.equal(handleGuard({ session_id: "s1", tool_name: "Read", tool_input: {} }, { root }), null);
  });
});

test("見張るツールの一覧が hooks.json の matcher と揃う形になっている", () => {
  assert.deepEqual(GUARDED_TOOLS, ["Bash", "Edit", "Write", "NotebookEdit"]);
});

test("装填後は既存テストファイルへのWrite全置換でアサーションを弱める内容も deny する", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const filePath = join(root, "existing.test.ts");
    writeFileSync(filePath, "assert.equal(result, 42);\n", "utf8");
    const out = handleGuard(
      {
        session_id: "s1",
        tool_name: "Write",
        tool_input: { file_path: filePath, content: "assert.equal(result, 99);\n" },
      },
      { root },
    );
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /weaken-assertion/);
  });
});

test("装填後はNotebookEditでも既存テストファイルの弱体化を deny する", () => {
  withRoot((root) => {
    armGuard("s1", { root });
    const filePath = join(root, "existing.test.ts");
    writeFileSync(filePath, "assert.equal(result, 42);\n", "utf8");
    const out = handleGuard(
      {
        session_id: "s1",
        tool_name: "NotebookEdit",
        tool_input: { notebook_path: filePath, new_source: "assert.equal(result, 99);\n" },
      },
      { root },
    );
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /weaken-assertion/);
  });
});
