import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECORDED_TOOLS } from "../lib/gate-hook.mjs";
import { GUARDED_TOOLS } from "../lib/spec-testing/guard-hook.mjs";
import { disarmGuard } from "../lib/spec-testing/guard-state.mjs";
import { EDIT_TOOLS, GUARD_DIR } from "../lib/worktree-guard.mjs";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

function runHook(name, payload) {
  return execFileSync("bash", [join(HOOKS_DIR, name)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

test("hooks.json は SessionStart / PreToolUse / PostToolUse / Stop を持つ", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  assert.ok(config.hooks.SessionStart, "SessionStart が消えている");
  assert.ok(config.hooks.PreToolUse, "PreToolUse が無い");
  assert.ok(config.hooks.PostToolUse, "PostToolUse が無い");
  assert.ok(config.hooks.Stop, "Stop が無い");
  assert.equal(config.hooks.PreToolUse[0].matcher, "Skill");
  assert.equal(config.hooks.PostToolUse[0].matcher, "Write|Edit");
});

test("PostToolUse の matcher は gate-hook.mjs の RECORDED_TOOLS と一致する", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  assert.equal(config.hooks.PostToolUse[0].matcher, RECORDED_TOOLS.join("|"));
});

test("hooks.json は run-hook.cmd 経由で呼ぶ", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  assert.match(config.hooks.PreToolUse[0].hooks[0].command, /run-hook\.cmd" gate-arm/);
  assert.match(config.hooks.PostToolUse[0].hooks[0].command, /run-hook\.cmd" gate-record/);
  assert.match(config.hooks.Stop[0].hooks[0].command, /run-hook\.cmd" gate-verify/);
});

test("hook スクリプトに実行ビットが立っている", () => {
  for (const name of ["gate-arm", "gate-verify"]) {
    const mode = statSync(join(HOOKS_DIR, name)).mode;
    assert.ok(mode & 0o100, `${name} に実行ビットが無い`);
  }
});

// gate-record は実行ビットを持たない。run-hook.cmd が `bash <file>` で
// 起動するため不要であり、実行ビットの付与には人間の承認が要る。
test("gate-record は run-hook.cmd 経由で起動できる", () => {
  const out = runHook("gate-record", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
    tool_name: "Write",
    tool_input: { file_path: join(HOOKS_DIR, "docs/superpowers/specs/a-design.md") },
  });
  assert.equal(out, "");
});

// spec/plan と無関係な payload では node を起動せず早期終了する。
// 起動しても node 側の isReviewTarget が false を返すので結果は同じだが、
// ここでは「node を起動しない」こと自体を確認するのではなく、
// 早期終了経路でも出力が空であることを確認する（起動抑制はプロセス数の
// 観測が要るため runHook では検証できない）。
test("spec/plan に無関係な payload では gate-record は何も出力しない", () => {
  const out = runHook("gate-record", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
    tool_name: "Write",
    tool_input: { file_path: join(HOOKS_DIR, "README.md") },
  });
  assert.equal(out, "");
});

test("装填が無いセッションで gate-verify は何も出力しない", () => {
  const out = runHook("gate-verify", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
  });
  assert.equal(out, "");
});

test("対象外スキルの gate-arm は何も出力しない", () => {
  const out = runHook("gate-arm", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
    tool_input: { skill: "superpowers:systematic-debugging" },
  });
  assert.equal(out, "");
});

test("PreToolUse の 3 つ目に完走ゲートの装填が載っている", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  const entry = config.hooks.PreToolUse[2];
  assert.ok(entry, "PreToolUse に完走ゲートのエントリが無い");
  assert.equal(entry.matcher, "Skill");
  assert.match(entry.hooks[0].command, /run-hook\.cmd" testing-complete arm/);
});

test("Stop の 2 つ目に完走ゲートの検証が載っている", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  assert.match(config.hooks.Stop[0].hooks[0].command, /gate-verify/, "既存の Stop が動いている");
  const entry = config.hooks.Stop[1];
  assert.ok(entry, "Stop に完走ゲートのエントリが無い");
  assert.match(entry.hooks[0].command, /run-hook\.cmd" testing-complete verify/);
});

test("装填が無いセッションで testing-complete は何も出力しない", () => {
  const out = runHook("testing-complete", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
  });
  assert.equal(out, "");
});

test("PreToolUse の 2 つ目にテストガードが載っている", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  const entry = config.hooks.PreToolUse[1];
  assert.ok(entry, "PreToolUse にガードのエントリが無い");
  assert.equal(entry.matcher, `Skill|${GUARDED_TOOLS.join("|")}`);
  assert.match(entry.hooks[0].command, /run-hook\.cmd" testing-guard/);
});

test("装填が無いセッションで testing-guard は何も出力しない", () => {
  const out = runHook("testing-guard", {
    session_id: "hooks-test-absent-session",
    cwd: HOOKS_DIR,
    tool_name: "Bash",
    tool_input: { command: "git push --force origin main" },
  });
  assert.equal(out, "");
});

test("PreToolUse の 4 つ目と UserPromptSubmit に worktree ガードが載っている", () => {
  const config = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  const entry = config.hooks.PreToolUse[3];
  assert.ok(entry, "PreToolUse に worktree ガードのエントリが無い");
  assert.deepEqual(entry.matcher.split("|").sort(), ["Bash", "Skill", ...EDIT_TOOLS].sort());
  assert.match(entry.hooks[0].command, /run-hook\.cmd" worktree-guard/);
  assert.match(config.hooks.UserPromptSubmit[0].hooks[0].command, /run-hook\.cmd" worktree-guard/);
});

// 本物の git リポジトリと、そこから切った worktree を一時フォルダに作り、
// フックの入口から判定までを通しで確かめる。
function withRepo(fn) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "worktree-guard-e2e-")));
  const main = join(base, "main");
  const wt = join(base, "wt");
  const git = (cwd, ...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.com",
      },
    });
  const sessions = [];
  const session = (name) => {
    const id = `hooks-test-worktree-guard-${process.pid}-${name}`;
    sessions.push(id);
    return id;
  };
  try {
    mkdirSync(main);
    git(main, "init", "-q", "-b", "main");
    git(main, "commit", "-q", "--allow-empty", "-m", "init");
    git(main, "worktree", "add", "-q", wt, "-b", "feature");
    fn({ main, wt, session });
  } finally {
    for (const id of sessions) disarmGuard(id, { dirName: GUARD_DIR });
    rmSync(base, { recursive: true, force: true });
  }
}

const decisionOf = (out) => (out === "" ? null : JSON.parse(out).hookSpecificOutput.permissionDecision);

test("worktree ガードはスキル起動で装填され、本物の worktree で (a)(b)(c) を判定する", () => {
  withRepo(({ main, wt, session }) => {
    const sid = session("skill");
    const skill = { session_id: sid, cwd: wt, tool_name: "Skill", tool_input: { skill: "kiai-sp:brainstorming" } };
    assert.equal(runHook("worktree-guard", skill), "");

    const bash = (cwd, command) =>
      runHook("worktree-guard", { session_id: sid, cwd, tool_name: "Bash", tool_input: { command } });
    const denied = bash(wt, `git -C ${main} commit --allow-empty -m x`);
    assert.equal(decisionOf(denied), "deny");
    assert.match(denied, /ExitWorktree/);
    assert.equal(bash(wt, `git -C ${main} log`), "");
    assert.equal(bash(wt, "git commit --allow-empty -m x"), "");
    assert.equal(bash(wt, "git push"), "");
    assert.equal(decisionOf(bash(main, "git push")), "ask");

    const write = (agent_id, file_path) =>
      runHook("worktree-guard", { session_id: sid, cwd: wt, agent_id, tool_name: "Write", tool_input: { file_path } });
    assert.equal(decisionOf(write("ag1", join(main, "a.txt"))), "deny");
    assert.equal(write("ag1", join(wt, "a.txt")), "");
    assert.equal(write(undefined, join(main, "a.txt")), "");
  });
});

test("worktree ガードは /kiai-sp: で始まる発話でも装填され、装填の無い会話では何も止めない", () => {
  withRepo(({ main, wt, session }) => {
    const command = `git -C ${main} commit --allow-empty -m x`;
    const bash = (sid) =>
      runHook("worktree-guard", { session_id: sid, cwd: wt, tool_name: "Bash", tool_input: { command } });

    assert.equal(bash(session("absent")), "");

    const sid = session("prompt");
    const prompt = { session_id: sid, cwd: wt, hook_event_name: "UserPromptSubmit", prompt: "/kiai-sp:subagent-driven-development plan.md" };
    assert.equal(runHook("worktree-guard", prompt), "");
    assert.equal(decisionOf(bash(sid)), "deny");
  });
});
