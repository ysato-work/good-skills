import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import * as guardModule from "./worktree-guard.mjs";
import { armGuard, readGuard } from "./spec-testing/guard-state.mjs";
import {
  EDIT_TOOLS,
  GUARD_DIR,
  TRUNK_NAMES,
  decide,
  handleWorktreeGuard,
  isReadOnlyGit,
  isTrunk,
  parseGitInvocation,
  splitSegments,
} from "./worktree-guard.mjs";

// ---------- 共通の道具 ----------
const WT = "/w/wt";
const fakeGit = (o = {}) => ({
  isInWorktree: () => true,
  worktreeRoot: () => WT,
  currentBranch: () => "feature/x",
  defaultBranch: () => "main",
  ...o,
});
const onBranch = (b, def = "main") => fakeGit({ currentBranch: () => b, defaultBranch: () => def });
const outsideGit = (o = {}) => fakeGit({ isInWorktree: () => false, worktreeRoot: () => null, ...o });
const byDir = (map, o = {}) => outsideGit({ currentBranch: (d) => map[d] ?? null, ...o });

const bash = (command, o = {}) => ({ tool_name: "Bash", tool_input: { command }, cwd: WT, session_id: "s1", ...o });
const edit = (path, o = {}) => ({
  tool_name: "Write",
  tool_input: { file_path: path },
  cwd: WT,
  session_id: "s1",
  agent_id: "ag1",
  ...o,
});
const notebook = (path, o = {}) => ({ ...edit(path), tool_name: "NotebookEdit", tool_input: { notebook_path: path }, ...o });
const withRoot = (fn) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-guard-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

// ---------- 定数 ----------
test("定数が受け渡しの形どおりである", () => {
  assert.equal(GUARD_DIR, "kiai-sp-worktree-guard");
  assert.deepEqual(TRUNK_NAMES, ["main", "master", "develop", "trunk"]);
  assert.deepEqual(EDIT_TOOLS, ["Write", "Edit", "NotebookEdit"]);
});

// ---------- splitSegments ----------
const SPLIT = [
  ["git status", ["git status"]],
  ["cd /x && git push", ["cd /x", "git push"]],
  ["git fetch || echo fail", ["git fetch", "echo fail"]],
  ["git status; git log", ["git status", "git log"]],
  ["git log | head -5", ["git log", "head -5"]],
  ["git status\ngit log", ["git status", "git log"]],
  ["  git status  &&   git log  ", ["git status", "git log"]],
  ["git status ;; && ", ["git status"]],
  ["", []],
  ["a && b || c ; d | e", ["a", "b", "c", "d", "e"]],
];
test("splitSegments は && || ; | 改行で区切り、空白と空の断片を落とす", () => {
  for (const [cmd, want] of SPLIT) assert.deepEqual(splitSegments(cmd), want, JSON.stringify(cmd));
});

// ---------- parseGitInvocation ----------
const P = (subcommand, rest = [], externalPaths = [], hasConfigOverride = false) => ({
  externalPaths,
  hasConfigOverride,
  subcommand,
  rest,
});
const PARSE = [
  ["ls -la", null],
  ["gitk --all", null],
  ["git status", P("status")],
  ["git log --oneline -5", P("log", ["--oneline", "-5"])],
  ["git -C /other/repo status", P("status", [], ["/other/repo"])],
  ["git --git-dir /other/.git log", P("log", [], ["/other/.git"])],
  ["git --git-dir=/other/.git log", P("log", [], ["/other/.git"])],
  ["git --work-tree /other commit -m x", P("commit", ["-m", "x"], ["/other"])],
  ["git --work-tree=/other status", P("status", [], ["/other"])],
  ["git -C /a --git-dir=/b --work-tree /c status", P("status", [], ["/a", "/b", "/c"])],
  ['git -C "/other repo" status', P("status", [], ["/other repo"])],
  ["git -C '/other repo' status", P("status", [], ["/other repo"])],
  ["git -c core.pager=x log", P("log", [], [], true)],
  ["git --config-env=a.b=ENV merge x", P("merge", ["x"], [], true)],
  ["git --config-env a.b=ENV status", P("status", [], [], true)],
  ["git --exec-path /x status", P("status", [], [], true)],
  ["git --exec-path=/x status", P("status", [], [], true)],
  ["git --no-pager -p log", P("log")],
  ["git commit -C abc123", P("commit", ["-C", "abc123"])],
  ["git", P(null)],
  ["git -C /x", P(null, [], ["/x"])],
];
test("parseGitInvocation は git 以外を null にし、グローバルオプションと引用符を読む", () => {
  for (const [seg, want] of PARSE) assert.deepEqual(parseGitInvocation(seg), want, seg);
});

// ---------- isReadOnlyGit ----------
const ALWAYS_READ = [
  "status", "log", "diff", "show", "rev-parse", "rev-list", "ls-files", "ls-tree", "blame",
  "shortlog", "cat-file", "for-each-ref", "describe", "ls-remote", "fetch", "count-objects",
  "verify-commit", "verify-pack",
];
const BRANCH_WRITE = [
  "-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move", "--copy", "--edit-description",
  "--set-upstream-to", "-u", "--unset-upstream", "--track", "--no-track", "--set-upstream-to=origin/main",
];
const TAG_WRITE = [
  "-a", "-s", "-u", "-f", "-d", "-v", "--annotate", "--sign", "--local-user", "--force", "--delete",
  "--verify", "-m", "-F", "--message", "--file", "--cleanup", "--edit",
];
const CONFIG_READ = ["--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--show-origin", "--show-scope"];
// [subcommand, rest, 期待]
const READONLY = [
  ["log", ["--oneline", "-5"], true],
  ...["merge", "commit", "push", "checkout", "reset", "rebase", "pull", "add"].map((s) => [s, [], false]),
  [null, [], false],
  ["branch", [], true],
  ["branch", ["newbranch"], false],
  ...BRANCH_WRITE.map((f) => ["branch", [f], false]),
  ["branch", ["--contains", "abc123"], true],
  ["branch", ["--merged", "main"], true],
  ["branch", ["--no-contains", "abc"], true],
  ["branch", ["--list", "feat*"], true],
  ["branch", ["-l"], true],
  ["branch", ["--points-at=HEAD"], true],
  ["branch", ["-d", "--merged"], false],
  ["tag", [], true],
  ["tag", ["v1.0"], false],
  ...TAG_WRITE.map((f) => ["tag", [f], false]),
  ["tag", ["--message=x", "v1"], false],
  ["tag", ["-l"], true],
  ["tag", ["--list", "v1*"], true],
  ["tag", ["-n5"], true],
  ["tag", ["--contains", "abc"], true],
  ...CONFIG_READ.map((f) => ["config", [f, "user.name"], true]),
  ["config", ["user.name", "x"], false],
  ["config", ["--unset", "user.name"], false],
  ["remote", [], true],
  ["remote", ["-v"], true],
  ["remote", ["show", "origin"], true],
  ["remote", ["get-url", "origin"], true],
  ["remote", ["add", "o", "url"], false],
  ["remote", ["remove", "origin"], false],
  ["stash", ["list"], true],
  ["stash", ["show", "-p"], true],
  ["stash", [], false],
  ["stash", ["pop"], false],
  ["worktree", ["list"], true],
  ["worktree", ["add", "../x"], false],
  ["worktree", ["remove", "x"], false],
  ["reflog", [], true],
  ["reflog", ["show", "HEAD"], true],
  ["reflog", ["exists", "refs/heads/x"], true],
  ["reflog", ["expire", "--all"], false],
  ["reflog", ["delete", "HEAD@{1}"], false],
];
test("常に読み取りの git サブコマンドは引数なしで true", () => {
  for (const s of ALWAYS_READ) assert.equal(isReadOnlyGit(s, []), true, s);
});
test("isReadOnlyGit は書き込み・読み取りを仕様の表どおりに分ける", () => {
  for (const [s, rest, want] of READONLY) assert.equal(isReadOnlyGit(s, rest), want, `${s} ${rest.join(" ")}`);
});

// ---------- isTrunk ----------
const TRUNK = [
  ...TRUNK_NAMES.map((b) => [b, null, true]),
  [null, "main", true],
  [null, null, true],
  ["feature/x", "main", false],
  ["release", "release", true],
  ["feature/x", null, false],
  ["main-fix", "main", false],
  ["Main", null, false],
];
test("isTrunk は trunk 名・既定ブランチ・名前不明を true にし、他は false", () => {
  for (const [b, def, want] of TRUNK) assert.equal(isTrunk(b, def), want, `${b} / ${def}`);
});

// ---------- decide ----------
const SCR = "/tmp/claude-1000/-home-x-proj";
const EXIT = ["ExitWorktree"];
const READS = [
  "status", "log --oneline", "diff", "show HEAD", "branch", "branch --merged main",
  "config --get user.name", "remote -v", "stash list", "worktree list",
];
// [説明, 入力, 期待 null|"deny"|"ask", 理由文に含む語, 偽 git]
const ROWS = [
  // (a) サブエージェントの worktree 外編集
  ["(a) 外への Write は拒否し対象の絶対パスを理由に含む", edit("/w/main/README.md"), "deny", ["/w/main/README.md"]],
  ["(a) Edit も対象", edit("/w/main/a.js", { tool_name: "Edit" }), "deny"],
  ["(a) NotebookEdit は notebook_path を見る", notebook("/w/main/n.ipynb"), "deny", ["/w/main/n.ipynb"]],
  ["(a) NotebookEdit は file_path が外でも notebook_path が内側なら止めない", notebook("/w/wt/n.ipynb", { tool_input: { file_path: "/w/main/x", notebook_path: "/w/wt/n.ipynb" } }), null],
  ["(a) 内側の絶対パスは止めない", edit("/w/wt/src/a.js"), null],
  ["(a) 最上位フォルダ自身は内側", edit("/w/wt"), null],
  ["(a) 前方一致するだけの兄弟フォルダは外", edit("/w/wt-other/a.js"), "deny"],
  ["(a) ../ で外に出る相対パスは cwd 基準で絶対化して拒否", edit("../main/a.js"), "deny", ["/w/main/a.js"]],
  ["(a) ../ を含むが内側に戻る相対パス", edit("src/../a.js"), null],
  ["(a) 内側の相対パス", edit("src/a.js"), null],
  ["(a) cwd が下層のときの相対パスは cwd 基準", edit("../../other/a.js", { cwd: "/w/wt/src/lib" }), null],
  ["(a) 絶対パスの ../ も正規化して外なら拒否", edit("/w/wt/../main/a.js"), "deny"],
  ["(a) 自分のスクラッチパッドは通す", edit(`${SCR}/s1/scratchpad/a.txt`), null],
  ["(a) スクラッチパッドの深い階層も通す", edit(`${SCR}/s1/scratchpad/sub/dir/a.json`), null],
  ["(a) 別会話のスクラッチパッドは拒否", edit(`${SCR}/s2/scratchpad/a.txt`), "deny"],
  ["(a) scratchpad でない同階層は拒否", edit(`${SCR}/s1/other/a.txt`), "deny"],
  ["(a) claude-数字 でないフォルダは拒否", edit("/tmp/claude-abc/-home-x-proj/s1/scratchpad/a.txt"), "deny"],
  ["(a) claude-2000 でも形が合えば通す", edit("/tmp/claude-2000/-home-x-proj/s1/scratchpad/a.txt"), null],
  ["(a) スクラッチパッド風の ../ 脱出は拒否", edit(`${SCR}/s1/scratchpad/../../../../w/main/a.js`), "deny"],
  ["(a) 親エージェントは止めない", edit("/w/main/a.js", { agent_id: undefined }), null],
  ["(a) agent_id が null も親", edit("/w/main/a.js", { agent_id: null }), null],
  ["(a) worktree の外にいるときは止めない", edit("/w/main/a.js", { cwd: "/w/main" }), null, [], outsideGit()],
  ["(a) 編集以外のツールは止めない", edit("/w/main/a.js", { tool_name: "Read" }), null],
  // (b) worktree 外を対象にした git
  ...READS.map((c) => [`(b) 外を対象にした読み取り ${c} は止めない`, bash(`git -C /w/main ${c}`), null]),
  ["(b) 外の merge は確認", bash("git -C /w/main merge feature/x"), "ask", EXIT],
  ["(b) 外の commit は拒否", bash("git -C /w/main commit -m x"), "deny", EXIT],
  ["(b) 外の reset は拒否", bash("git -C /w/main reset --hard"), "deny", EXIT],
  ["(b) 外の branch 作成は拒否", bash("git -C /w/main branch newbr"), "deny", EXIT],
  ["(b) 外の push は (c) より (b) が優先して拒否", bash("git -C /w/main push origin main"), "deny", EXIT, onBranch("main")],
  ["(b) --git-dir= 形式で外を指す", bash("git --git-dir=/w/main/.git commit -m x"), "deny", EXIT],
  ["(b) --git-dir 空白形式で外を指す", bash("git --git-dir /w/main/.git commit -m x"), "deny", EXIT],
  ["(b) --work-tree= 形式の merge は確認", bash("git --work-tree=/w/main merge x"), "ask", EXIT],
  ["(b) --work-tree 空白形式で外を指す", bash("git --work-tree /w/main checkout x"), "deny", EXIT],
  ["(b) 引用符付きの外パス", bash('git -C "/w/main" commit -m x'), "deny", EXIT],
  ["(b) 空白入り引用符付きの外パス", bash("git -C '/w/other repo' commit -m x"), "deny", EXIT],
  ["(b) 引用符付きで内側を指す", bash('git -C "/w/wt/sub" commit -m x'), null],
  ["(b) 相対 ../main で外を指す", bash("git -C ../main commit -m x"), "deny", EXIT],
  ["(b) -C . は内側", bash("git -C . commit -m x"), null],
  ["(b) 最上位フォルダ自身を指す", bash("git -C /w/wt commit -m x"), null],
  ["(b) 最上位のサブフォルダを指す", bash("git -C /w/wt/src commit -m x"), null],
  ["(b) 前方一致するだけの兄弟は外", bash("git -C /w/wt-other commit -m x"), "deny", EXIT],
  ["(b) cwd が下層で ../.. が最上位に戻る", bash("git -C ../.. commit -m x", { cwd: "/w/wt/a/b" }), null],
  ["(b) 外を指さない git は止めない", bash("git commit -m x"), null],
  ["(b) git 以外のコマンドは止めない", bash("ls /w/main"), null],
  ["(b) worktree の外にいるときは止めない", bash("git -C /w/other commit -m x", { cwd: "/w/main" }), null, [], outsideGit()],
  ["(b) 設定上書き付きの merge は確認", bash("git -C /w/main -c core.hooksPath=/x merge a"), "ask", EXIT],
  ["(b) 設定上書き付きの commit は拒否", bash("git -C /w/main -c core.hooksPath=/x commit -m x"), "deny", EXIT],
  ["(b) 設定上書き付きは読み取りでも拒否", bash("git -C /w/main -c core.pager=x log"), "deny", EXIT],
  ["(b) --config-env 付きの status は拒否", bash("git -C /w/main --config-env=a.b=ENV status"), "deny", EXIT],
  ["(b) --exec-path 付きの merge は確認", bash("git --exec-path=/x -C /w/main merge a"), "ask", EXIT],
  ["(b) --exec-path 空白形式付きの diff は拒否", bash("git --exec-path /x -C /w/main diff"), "deny", EXIT],
  ["(b) 外を指さない設定上書きだけなら止めない", bash("git -c core.pager=x log"), null],
  ["(b) 内側の -C と外側の -C が混在したら拒否", bash("git -C /w/wt -C /w/main commit -m x"), "deny", EXIT],
  // 複数の断片
  ["複合 && の 2 つ目が外で拒否", bash("cd /w/wt && git -C /w/main commit -m x"), "deny", EXIT],
  ["複合 どちらも安全なら通す", bash("git status && git log"), null],
  ["複合 外の読み取りと内の操作は通す", bash("git -C /w/main log; git commit -m x"), null],
  ["複合 deny と ask が混在したら deny", bash("git -C /w/main merge a && git -C /w/main commit -m x"), "deny"],
  ["複合 順序を入れ替えても deny", bash("git -C /w/main commit -m x && git -C /w/main merge a"), "deny"],
  ["複合 ask のみなら ask", bash("git -C /w/main merge a && git status"), "ask", EXIT],
  ["複合 (b) deny と (c) ask は deny", bash("git -C /w/main commit -m x && git push"), "deny", [], onBranch("main")],
  ["複合 (b) ask と (c) ask は ask", bash("git -C /w/main merge a && git push"), "ask", [], onBranch("main")],
  ["複合 パイプ後の git", bash("echo x | git -C /w/main commit -F -"), "deny", EXIT],
  ["複合 改行区切りの git", bash("echo a\ngit -C /w/main commit -m x"), "deny", EXIT],
  ["Bash の command が空なら null", bash(""), null],
  // (c) trunk 系での push
  ...TRUNK_NAMES.map((b) => [`(c) ${b} での push は確認しブランチ名を理由に含む`, bash(`git push origin ${b}`), "ask", [b], onBranch(b)]),
  ["(c) 既定ブランチ(release)での push は確認", bash("git push"), "ask", ["release"], onBranch("release", "release")],
  ["(c) trunk 系以外の push は止めない", bash("git push origin feature/x"), null, [], onBranch("feature/x")],
  ["(c) worktree の外でも trunk なら確認", bash("git push", { cwd: "/w/main" }), "ask", ["main"], outsideGit({ currentBranch: () => "main" })],
  ["(c) worktree の外で trunk 系以外は止めない", bash("git push", { cwd: "/w/main" }), null, [], outsideGit()],
  ["(c) ブランチ名が取れないときは確認", bash("git push"), "ask", [], onBranch(null, null)],
  ["(c) push 以外は止めない", bash("git pull"), null, [], onBranch("main")],
  ["(c) trunk 上でも commit は止めない", bash("git commit -m x"), null, [], onBranch("main")],
  ["(c) 複合の 2 つ目が push", bash("git commit -m x && git push"), "ask", [], onBranch("main")],
  ["(c) 複合の 1 つ目が push", bash("git push && echo done"), "ask", [], onBranch("master")],
  ["(c) --force-with-lease 付きも確認", bash("git push --force-with-lease origin main"), "ask", [], onBranch("main")],
  ["(c) 設定上書き付き(外を指さない)の push も確認", bash("git -c a.b=c push"), "ask", [], onBranch("main")],
  ["(c) -C . の push は cwd のブランチで判定して確認", bash("git -C . push"), "ask", ["main"], onBranch("main")],
  ["(c) 外のフォルダを -C で指す push は -C 先のブランチで判定する", bash("git -C /w/main push", { cwd: "/w/work" }), "ask", ["main"], byDir({ "/w/work": "feature/x", "/w/main": "main" })],
  ["(c) cwd が trunk でも -C 先が trunk 系以外なら止めない", bash("git -C /w/other push", { cwd: "/w/work" }), null, [], byDir({ "/w/work": "main", "/w/other": "feature/x" })],
  ["(c) -C の相対パスは cwd 基準で絶対化してから判定する", bash("git -C ../main push", { cwd: "/w/work" }), "ask", ["main"], byDir({ "/w/work": "feature/x", "/w/main": "main" })],
  ["(c) -C が複数なら最後の要素で判定する(最後が trunk)", bash("git -C /w/other -C /w/main push", { cwd: "/w/work" }), "ask", [], byDir({ "/w/other": "feature/x", "/w/main": "main" })],
  ["(c) -C が複数なら最後の要素で判定する(最後が trunk 系以外)", bash("git -C /w/main -C /w/other push", { cwd: "/w/work" }), null, [], byDir({ "/w/other": "feature/x", "/w/main": "main" })],
  ["(c) 文字列 push を含むだけの別コマンドは止めない", bash("echo git push"), null, [], onBranch("main")],
  ["(c) git push-helper のような別サブコマンドは止めない", bash("git push-helper"), null, [], onBranch("main")],
  // 対象外のツール
  ...["Read", "Grep", "Skill"].map((t) => [`${t} は null`, { tool_name: t, tool_input: {}, cwd: WT, session_id: "s1" }, null]),
];

for (const [name, input, want, has = [], git = fakeGit()] of ROWS) {
  test(name, () => {
    const r = decide(input, git);
    if (want === null) {
      assert.equal(r, null);
      return;
    }
    assert.equal(r?.decision, want);
    assert.equal(typeof r.reason, "string");
    assert.ok(r.reason.length > 0, "理由文が空");
    for (const w of has) assert.ok(r.reason.includes(w), `理由文に ${w} が無い: ${r.reason}`);
  });
}

test("decide は 'allow' を返さず、止めないときは null を返す", () => {
  for (const [name, input, , , git = fakeGit()] of ROWS) {
    const r = decide(input, git);
    assert.ok(r === null || r.decision === "deny" || r.decision === "ask", name);
  }
});

// ---------- handleWorktreeGuard ----------
const skillIn = (skill) => ({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill } });
const promptIn = (prompt) => ({ session_id: "s1", hook_event_name: "UserPromptSubmit", prompt });
const DANGER = () => bash("git -C /w/main commit -m x");
const run = (root, input, git = fakeGit(), extra = {}) => handleWorktreeGuard(input, { root, git, ...extra });
const isArmed = (root, sid = "s1") => readGuard(sid, { root, dirName: GUARD_DIR }) !== null;
const boom = () => {
  throw new Error("boom");
};
const boomGit = fakeGit({ isInWorktree: boom, worktreeRoot: boom, currentBranch: boom, defaultBranch: boom });

test("装填前は (a)(b)(c) のどれも止めず、判定自体も呼ばない", () => {
  withRoot((root) => {
    const inputs = [DANGER(), bash("git push"), edit("/w/main/a.js")];
    for (const i of inputs) {
      assert.equal(run(root, i, onBranch("main")), null);
      assert.equal(run(root, i, boomGit), null);
    }
  });
});

test("kiai-sp のどのスキルの起動でも装填され、起動自体は止めない", () => {
  for (const s of ["kiai-sp:brainstorming", "kiai-sp:executing-plans", "kiai-sp:using-git-worktrees"]) {
    withRoot((root) => {
      assert.equal(run(root, skillIn(s)), null, s);
      assert.equal(isArmed(root), true, s);
    });
  }
});

test("kiai-sp 以外のスキル名では装填しない", () => {
  for (const s of ["superpowers:brainstorming", "brainstorming", "kiai-sp-other:x", "xkiai-sp:x"]) {
    withRoot((root) => {
      run(root, skillIn(s));
      assert.equal(isArmed(root), false, s);
      assert.equal(run(root, DANGER()), null, s);
    });
  }
});

test("UserPromptSubmit が空白を除いて /kiai-sp: で始まれば装填し、null を返す", () => {
  for (const p of ["/kiai-sp:brainstorming foo", "  \n /kiai-sp:writing-plans"]) {
    withRoot((root) => {
      assert.equal(run(root, promptIn(p)), null);
      assert.equal(isArmed(root), true, p);
    });
  }
});

test("それ以外の UserPromptSubmit は装填せず null", () => {
  for (const p of ["hello", "/superpowers:brainstorming", "please run /kiai-sp:brainstorming"]) {
    withRoot((root) => {
      assert.equal(run(root, promptIn(p)), null);
      assert.equal(isArmed(root), false, p);
    });
  }
});

test("UserPromptSubmit で装填したあとは (b) を拒否し、装填済みでも UserPromptSubmit 自体は null", () => {
  withRoot((root) => {
    run(root, promptIn("/kiai-sp:x"));
    assert.equal(run(root, DANGER()).hookSpecificOutput.permissionDecision, "deny");
    assert.equal(run(root, promptIn("hello")), null);
  });
});

test("装填後は (a)(b)(c) を止め、出力の形は PreToolUse の permissionDecision になる", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    const cases = [
      [DANGER(), fakeGit(), "deny", /ExitWorktree/],
      [bash("git push"), onBranch("main"), "ask", /main/],
      [edit("/w/main/a.js"), fakeGit(), "deny", /\/w\/main\/a\.js/],
    ];
    for (const [input, git, want, re] of cases) {
      const out = run(root, input, git);
      assert.deepEqual(Object.keys(out), ["hookSpecificOutput"]);
      assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.equal(out.hookSpecificOutput.permissionDecision, want);
      assert.match(out.hookSpecificOutput.permissionDecisionReason, re);
    }
  });
});

test("装填後でも worktree 内の操作・読み取り・trunk 系以外の push は null", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    assert.equal(run(root, bash("git status")), null);
    assert.equal(run(root, edit("/w/wt/a.js")), null);
    assert.equal(run(root, bash("git push"), onBranch("feature/x")), null);
  });
});

test("装填はセッションごとで、別セッションや session_id の無い入力には効かず、例外も出さない", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    for (const sid of ["s2", undefined]) assert.equal(run(root, bash("git -C /w/main commit -m x", { session_id: sid })), null);
  });
});

test("判定中の例外は通さず ask にし、理由文にエラーと例外メッセージを含める", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    const cases = [
      [bash("git push"), boomGit],
      [edit("/w/main/a.js"), fakeGit({ worktreeRoot: boom })],
    ];
    for (const [input, git] of cases) {
      const out = run(root, input, git);
      assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /エラー/);
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /boom/);
    }
  });
});

test("装填の記録は kiai-sp-worktree-guard に置かれ、テスト用ガードの記録とは独立している", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    assert.equal(existsSync(join(root, "kiai-sp-worktree-guard", "s1.json")), true);
    assert.equal(existsSync(join(root, "kiai-sp-testing-guard")), false);
  });
  withRoot((root) => {
    armGuard("s1", { root });
    assert.equal(run(root, DANGER()), null);
  });
});

test("opts.now が装填時刻として記録される", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"), fakeGit(), { now: "2026-10-01T00:00:00.000Z" });
    assert.equal(readGuard("s1", { root, dirName: GUARD_DIR }).armedAt, "2026-10-01T00:00:00.000Z");
  });
});

// ======================================================================
// Task 2 修正の追加テスト（仕様: 修正 1〜6 と「細部の決め」）
// ======================================================================
const HOME = homedir();
const HW = `${HOME}/wt`;
const homeGit = fakeGit({ worktreeRoot: () => HW });
const hb = (c) => bash(c, { cwd: HW });
const branchesByDir = (map) => fakeGit({ currentBranch: (d) => map[d] ?? null });
const UNDECIDED = ["決められない"];
const CONFIG_ENVS = [
  "GIT_CONFIG_PARAMETERS='x'", "GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=a.b", "GIT_CONFIG_VALUE_0=c",
  "GIT_CONFIG_GLOBAL=/x", "GIT_CONFIG_SYSTEM=/x", "GIT_EXEC_PATH=/x",
];

const checkRows = (rows) => {
  for (const [name, input, want, has = [], git = fakeGit()] of rows) {
    test(name, () => {
      const r = decide(input, git);
      if (want === null) {
        assert.equal(r, null, JSON.stringify(r));
        return;
      }
      assert.equal(r?.decision, want, JSON.stringify(r));
      assert.equal(typeof r.reason, "string");
      for (const w of has) assert.ok(r.reason.includes(w), `理由文に ${w} が無い: ${r.reason}`);
    });
  }
};

// ---------- 修正 3: splitSegments ----------
const SPLIT2 = [
  ["git status & git log", ["git status", "git log"]],
  ["a && b", ["a", "b"]],
  ['git commit -m "a && git push"', ['git commit -m "a && git push"']],
  ["echo 'a; b | c' | cat", ["echo 'a; b | c'", "cat"]],
  ['git commit -m "line1\nline2" && git status', ['git commit -m "line1\nline2"', "git status"]],
  ["git commit -m x 2>&1", ["git commit -m x 2>&1"]],
  ["cmd &> out.log", ["cmd &> out.log"]],
  ["cat <&3", ["cat <&3"]],
  ["echo a >&2 && b", ["echo a >&2", "b"]],
  ['git commit -m "a && git push', ['git commit -m "a && git push']],
];
test("splitSegments は単独の & で区切り、引用符の中と >& &> <& の & では区切らず、引用符を残す", () => {
  for (const [cmd, want] of SPLIT2) assert.deepEqual(splitSegments(cmd), want, JSON.stringify(cmd));
});

// ---------- 修正 2〜6: decide ----------
const FIX_ROWS = [
  // 修正 2: git の前に付くもの
  ["GIT_DIR= は行き先の指定で、外への commit は拒否", bash("GIT_DIR=/w/main/.git git commit -m x"), "deny"],
  ["GIT_DIR= の外への merge は確認", bash("GIT_DIR=/w/main/.git git merge x"), "ask"],
  ["GIT_DIR= の外への読み取りは止めない", bash("GIT_DIR=/w/main/.git git status"), null],
  ["GIT_WORK_TREE= は行き先の指定", bash("GIT_WORK_TREE=/w/main git commit -m x"), "deny"],
  ["GIT_COMMON_DIR= は行き先の指定", bash("GIT_COMMON_DIR=/w/main/.git git commit -m x"), "deny"],
  ...CONFIG_ENVS.map((e) => [`${e} は設定を書き換える指定で、外への読み取りでも拒否`, bash(`${e} git -C /w/main status`), "deny"]),
  ["GIT_CONFIG_PARAMETERS 付きの外への merge は確認", bash("GIT_CONFIG_PARAMETERS='x' git -C /w/main merge y"), "ask"],
  ["設定を書き換える環境変数だけで行き先が無ければ止めない", bash("GIT_CONFIG_COUNT=1 git status"), null],
  ["それ以外の環境変数は読み飛ばし、読んだ先の git を判定する", bash("FOO=bar git -C /w/main commit -m x"), "deny"],
  ["それ以外の環境変数を読み飛ばしたあとの trunk での push は確認", bash("FOO=bar git push origin main"), "ask", [], onBranch("main")],
  ["env の後ろの 名前=値 も行き先の指定として読む", bash("env GIT_DIR=/w/main/.git git commit -m x"), "deny"],
  ["env の直後の - で始まる語は読み飛ばす", bash("env -i git -C /w/main commit -m x"), "deny"],
  ...["command", "sudo", "time -p", "nohup"].map((p) => [`前置きの ${p} を読み飛ばして git を判定する`, bash(`${p} git -C /w/main commit -m x`), "deny"]),
  ["コマンド名は最後の / より後ろだけを見る", bash("/usr/bin/git -C /w/main commit -m x"), "deny"],
  ["名前の最後が git でなければ git ではない", bash("/usr/local/bin/mygit -C /w/main commit -m x"), null],
  ["前置きだけの断片で落ちず止めない", bash("env"), null],
  // 修正 3: 区切りと引用符
  ["引用符の中の && の後ろは別の断片にならない", bash('git commit -m "a && git push"'), null, [], onBranch("main")],
  ["単独の & の後ろの git も trunk での push として確認する", bash("sleep 1 & git push origin main"), "ask", [], onBranch("main")],
  ["先頭の ( と末尾の ) を読み飛ばす", bash("(git -C /w/main commit -m x)"), "deny"],
  ["先頭の { と末尾の } を読み飛ばす", bash("{ git -C /w/main commit -m x; }"), "deny"],
  ["先頭の ! を読み飛ばす", bash("! git -C /w/main commit -m x"), "deny"],
  ["語としての then を読み飛ばす", bash("if true; then git -C /w/main commit -m x; fi"), "deny"],
  ["語としての else を読み飛ばす", bash("if false; then echo a; else git push origin main; fi"), "ask", [], onBranch("main")],
  ["2>&1 付きの外への読み取りは止めない", bash("git -C /w/main status 2>&1 | head"), null],
  ["worktree 内の普段の複合コマンドは止めない", bash('git add . && git commit -m "fix: a && b" && git log | head'), null],
  // 修正 4: ~ と $
  ["~/ はホームに置き換え、worktree の中なら止めない", hb("git -C ~/wt commit -m x"), null, [], homeGit],
  ["~/ はホームに置き換え、外なら拒否", hb("git -C ~/other commit -m x"), "deny", [], homeGit],
  ["~ だけの行き先はホームで、外なら拒否", hb("git -C ~ commit -m x"), "deny", [], homeGit],
  ["~ だけの行き先の読み取りは止めない", hb("git -C ~ status"), null, [], homeGit],
  ["GIT_DIR=~/ もホームに置き換える", hb("GIT_DIR=~/other/.git git commit -m x"), "deny", [], homeGit],
  ["~名前 の行き先への書き込みは決められないので確認", bash("git -C ~bob commit -m x"), "ask", UNDECIDED],
  ["~名前 の行き先への merge は確認", bash("git -C ~bob merge x"), "ask"],
  ["~名前 の行き先への読み取りは止めない", bash("git -C ~bob status"), null],
  ["決められない行き先で設定の書き換えがあれば読み取りでも確認", bash("git -C ~bob -c a.b=c status"), "ask"],
  ["$ を含む行き先への読み取りは止めない", bash("git -C $PWD/x status"), null],
  ["$ を含む行き先への書き込みは決められないので確認", bash("git -C $PWD/x commit -m x"), "ask", UNDECIDED],
  ["バッククォートを含む行き先への書き込みは決められないので確認", bash("git -C `pwd` commit -m x"), "ask", UNDECIDED],
  ["単一引用符の中の $ も決められない", bash("git -C '$X' commit -m x"), "ask", UNDECIDED],
  ["決められない行き先の他に外と決まった行き先があればそちらで拒否", bash("git -C $X --git-dir /w/main/.git commit -m x"), "deny"],
  ["push のブランチを調べるフォルダが決められなければ確認", bash("git -C $X push origin x"), "ask"],
  ["コミットメッセージの ~ と $ は行き先ではないので止めない", bash('git commit -m "see ~ and $HOME"'), null],
  // 修正 5: -C を重ねる
  ["2 つ目の -C の相対パスは 1 つ前の -C を起点にする（外）", bash("git -C /w/main -C sub commit -m x"), "deny"],
  ["-C を順に適用した最後が中なら途中が外でも止めない", bash("git -C /w/main -C ../wt commit -m x"), null],
  ["cwd 起点の -C .. は外", bash("git -C .. commit -m x"), "deny"],
  ["--git-dir の相対は cwd 起点で解決する", bash("git --git-dir=../.git commit -m x", { cwd: "/w/wt/sub" }), null],
  ["--git-dir の相対は -C を全部適用したあとの場所が起点", bash("git -C /w/wt/sub --git-dir=../.git commit -m x"), null],
  ["GIT_DIR の相対も -C を全部適用したあとの場所が起点", bash("GIT_DIR=../x git -C /w/wt/sub commit -m x"), null],
  ["--work-tree の相対も -C を全部適用したあとの場所が起点", bash("git -C /w/wt/a --work-tree=../b commit -m x"), null],
  ["push のブランチは -C を適用した行き先で調べる（trunk なら確認）", bash("git -C /w/wt/sub push origin main"), "ask", [], branchesByDir({ "/w/wt/sub": "main", "/w/wt": "feature/x" })],
  ["push のブランチは cwd ではなく行き先で調べる（行き先が feature なら止めない）", bash("git -C /w/wt/sub push"), null, [], branchesByDir({ "/w/wt/sub": "feature/x", "/w/wt": "main" })],
  ["push のブランチは行き先の指定のうち最後（--work-tree）で調べる", bash("git -C /w/wt/a --work-tree=../b push"), "ask", [], branchesByDir({ "/w/wt/b": "main", "/w/wt/a": "feature/x" })],
  // 修正 6: 作業フォルダの移動
  ["外へ移動したあとの commit は拒否", bash("cd /w/main && git commit -m x"), "deny"],
  ["外へ移動したあとの merge は確認", bash("cd /w/main && git merge x"), "ask"],
  ["外へ移動したあとの読み取りは止めない", bash("cd /w/main && git status"), null],
  ["移動した作業フォルダは後ろの断片すべてに効く", bash("cd /w/main && git status && git commit -m x"), "deny"],
  ["外へ移動して中へ戻れば止めない", bash("cd /w/main && cd /w/wt && git commit -m x"), null],
  ["cd .. で外に出たら拒否", bash("cd .. && git commit -m x"), "deny"],
  ["中の相対移動は止めない", bash("cd sub && git commit -m x"), null],
  ["移動は後ろの断片にだけ効く", bash("git commit -m x && cd /w/main"), null],
  ["移動先が外でも -C が中を指す git はその行き先で判定する", bash("cd /w/main && git -C /w/wt commit -m x"), null],
  ["外へ移動したあとの設定書き換えありの読み取りは拒否", bash("cd /w/main && git -c a.b=c status"), "deny"],
  ["外へ移動したあとの push は書き込みが外なので (c) の確認より deny を優先", bash("cd /w/main && git push"), "deny"],
  ["引数なしの cd はホームへの移動で、外なら拒否", bash("cd && git commit -m x"), "deny"],
  ["移動先の ~/ はホームに置き換える", hb("cd ~/wt && git commit -m x"), null, [], homeGit],
  ["cd - のあとの書き込みは決められないので確認", bash("cd - && git commit -m x"), "ask", UNDECIDED],
  ["cd - のあとの読み取りは止めない", bash("cd - && git status"), null],
  ["cd - のあとの push は確認", bash("cd - && git push"), "ask"],
  ["popd のあとの書き込みは確認", bash("popd && git commit -m x"), "ask"],
  ["pushd も cd と同じ移動として扱う", bash("pushd /w/main && git commit -m x"), "deny"],
  ["$ を含む移動先のあとの書き込みは決められないので確認", bash("cd $X && git commit -m x"), "ask", UNDECIDED],
  ["決められない作業フォルダで設定の書き換えがあれば読み取りでも確認", bash("cd $X && git -c a.b=c status"), "ask"],
  ["決められなくなっても絶対パスへの移動で作業フォルダは再び決まる", bash("cd $X && cd /w/wt && git commit -m x"), null],
  ["括弧の中の移動も外に効くものとして扱う", bash("(cd /w/main && git commit -m x)"), "deny"],
  ["echo の引数の文字列は移動ではない", bash('echo "cd /w/main" && git commit -m x'), null],
  // 対象外（追わない）
  ["対象外: bash -c に渡した git は追わない", bash('bash -c "git -C /w/main commit -m x"'), null],
  ["対象外: eval に渡した git は追わない", bash('eval "git -C /w/main commit -m x"'), null],
  ["対象外: xargs git は追わない", bash("echo x | xargs git -C /w/main commit -m"), null],
  ["対象外: $(...) とバッククォートの中は追わない", bash("echo $(git -C /w/main commit -m x)"), null],
  ["対象外: sudo にオプションの値を渡す形は追わない", bash("sudo -u bob git -C /w/main commit -m x"), null],
  ["対象外: trunk 以外から trunk 名を指定した push は追わない", bash("git push origin HEAD:main"), null, [], onBranch("feature/x")],
];
checkRows(FIX_ROWS);

test("decide は git の例外を握りつぶさずそのまま投げる", () => {
  assert.throws(() => decide(bash("git status"), boomGit), /boom/);
});

// ---------- 修正 1: handleWorktreeGuard と例外 ----------
test("作業フォルダが存在しないとき realGit の失敗で ask になる", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    const out = run(root, bash("git status", { cwd: join(root, "does-not-exist") }), guardModule.realGit);
    assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  });
});

test("push のブランチ取得で git が失敗したら ask になる", () => {
  withRoot((root) => {
    run(root, skillIn("kiai-sp:brainstorming"));
    const out = run(root, bash("git push origin x"), fakeGit({ currentBranch: boom }));
    assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  });
});

// ---------- 修正 1: realGit（本物の git） ----------
const gitRun = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const withRepo = (fn) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "worktree-guard-real-")));
  try {
    const main = join(base, "main");
    mkdirSync(main);
    gitRun(main, "init", "-q");
    gitRun(main, "commit", "-q", "--allow-empty", "-m", "init");
    const wt = join(base, "wt");
    gitRun(main, "worktree", "add", "-q", "-b", "wt-branch", wt);
    const plain = join(base, "plain");
    mkdirSync(plain);
    fn({ base, main, wt, plain });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
};
const withFakeGit = (script, fn) => {
  const bin = mkdtempSync(join(tmpdir(), "worktree-guard-bin-"));
  const work = mkdtempSync(join(tmpdir(), "worktree-guard-work-"));
  const oldPath = process.env.PATH;
  try {
    if (script !== null) {
      writeFileSync(join(bin, "git"), script);
      chmodSync(join(bin, "git"), 0o755);
    }
    process.env.PATH = bin;
    fn(work);
  } finally {
    process.env.PATH = oldPath;
    rmSync(bin, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
};

test("realGit: リンクされた worktree の中は true で最上位がその worktree、メインの作業フォルダは false", () => {
  withRepo(({ main, wt }) => {
    assert.equal(guardModule.realGit.isInWorktree(wt), true);
    assert.equal(realpathSync(guardModule.realGit.worktreeRoot(wt)), wt);
    assert.equal(guardModule.realGit.isInWorktree(main), false);
  });
});

test("realGit: worktree の中では現在のブランチ名を返す", () => {
  withRepo(({ wt }) => assert.equal(guardModule.realGit.currentBranch(wt), "wt-branch"));
});

test("realGit: detached HEAD では currentBranch が null", () => {
  withRepo(({ main }) => {
    gitRun(main, "checkout", "-q", "--detach");
    assert.equal(guardModule.realGit.currentBranch(main), null);
  });
});

test("realGit: 既定ブランチが取れなければ defaultBranch は null", () => {
  withRepo(({ main }) => assert.equal(guardModule.realGit.defaultBranch(main), null));
});

test("realGit: git 管理外のフォルダは worktree ではなく、最上位もブランチも null", () => {
  withRepo(({ plain }) => {
    assert.equal(guardModule.realGit.isInWorktree(plain), false);
    assert.equal(guardModule.realGit.worktreeRoot(plain), null);
    assert.equal(guardModule.realGit.currentBranch(plain), null);
  });
});

test("realGit: 存在しないフォルダでは 3 つの問い合わせが例外を投げる", () => {
  withRepo(({ base }) => {
    const gone = join(base, "does-not-exist");
    for (const m of ["isInWorktree", "worktreeRoot", "currentBranch"]) assert.throws(() => guardModule.realGit[m](gone), m);
  });
});

test("realGit: git が見つからなければ例外を投げる", () => {
  withFakeGit(null, (work) => assert.throws(() => guardModule.realGit.isInWorktree(work)));
});

test("realGit: 128 でもエラー出力に not a git repository が無ければ例外を投げる", () => {
  withFakeGit("#!/bin/sh\necho 'fatal: something else' >&2\nexit 128\n", (work) =>
    assert.throws(() => guardModule.realGit.isInWorktree(work)));
});

test("realGit: エラー出力に not a git repository があっても終了コードが 128 でなければ例外を投げる", () => {
  withFakeGit("#!/bin/sh\necho 'fatal: not a git repository' >&2\nexit 1\n", (work) =>
    assert.throws(() => guardModule.realGit.isInWorktree(work)));
});

test("realGit: 128 かつ not a git repository なら正常な答えとして worktree ではない", () => {
  withFakeGit("#!/bin/sh\necho 'fatal: not a git repository (or any of the parent directories): .git' >&2\nexit 128\n", (work) => {
    assert.equal(guardModule.realGit.isInWorktree(work), false);
    assert.equal(guardModule.realGit.worktreeRoot(work), null);
    assert.equal(guardModule.realGit.currentBranch(work), null);
  });
});

// ---------- 修正 7: リンク越しの道筋を実体に揃えてから比べる ----------
const withLinks = (fn) => {
  const T = realpathSync(mkdtempSync(join(tmpdir(), "worktree-guard-link-")));
  try {
    const main = join(T, "main");
    const wt = join(T, "wt");
    mkdirSync(main);
    mkdirSync(join(wt, "real"), { recursive: true });
    writeFileSync(join(main, "f.txt"), "x");
    symlinkSync(wt, join(T, "link"));
    symlinkSync(main, join(T, "mainlink"));
    symlinkSync(main, join(wt, "out"));
    symlinkSync(join(wt, "real"), join(wt, "ln"));
    symlinkSync(join(main, "f.txt"), join(wt, "l.txt"));
    fn({ T, main, wt, git: fakeGit({ worktreeRoot: () => wt }) });
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
};
const LINK_ROWS = [
  ["リンク経由の作業フォルダでも worktree の中への編集は止めない", (c) => edit(`${c.T}/link/a.txt`, { cwd: `${c.T}/link` }), null],
  ["リンク経由でまだ無いフォルダ配下への編集も、実在する部分を実体にして中と判定する", (c) => edit(`${c.T}/link/newdir/new.txt`, { cwd: `${c.T}/link` }), null],
  ["リンク経由の作業フォルダでも NotebookEdit は中と判定する", (c) => notebook(`${c.T}/link/n.ipynb`, { cwd: `${c.T}/link` }), null],
  ["リンク経由の作業フォルダでも commit は外扱いにならない", (c) => bash("git commit -m x", { cwd: `${c.T}/link` }), null],
  ["worktree の中のリンクが外を指すとき、そのリンク越しの編集は外として拒否する", (c) => edit(`${c.wt}/out/f.txt`), "deny"],
  ["外を指すリンク越しでまだ無いファイルでも、実在する最深フォルダを実体にして外と判定する", (c) => edit(`${c.wt}/out/not-yet/new.txt`), "deny"],
  ["外を指すファイルリンクは、ファイルが実在すればファイルまで実体にして外と判定する", (c) => edit(`${c.wt}/l.txt`), "deny"],
  ["worktree の中を指すリンク越しの編集は中のまま止めない", (c) => edit(`${c.wt}/ln/x.txt`), null],
  ["-C がリンク経由で外を指す commit は拒否する", (c) => bash(`git -C ${c.T}/mainlink commit -m x`, { cwd: c.wt }), "deny"],
  ["cd 先がリンク経由で外なら、移動後の commit は拒否する", (c) => bash(`cd ${c.T}/mainlink && git commit -m x`, { cwd: c.wt }), "deny"],
  ["cd 先がリンク経由で中なら、移動後の commit は止めない", (c) => bash(`cd ${c.T}/link && git commit -m x`, { cwd: c.wt }), null],
  ["-C がリンク経由で中を指すなら commit は止めない", (c) => bash(`git -C ${c.T}/link commit -m x`, { cwd: c.wt }), null],
];
for (const [name, mk, want] of LINK_ROWS) {
  test(name, () =>
    withLinks((c) => {
      const r = decide(mk(c), c.git);
      if (want === null) assert.equal(r, null, JSON.stringify(r));
      else assert.equal(r?.decision, want, JSON.stringify(r));
    }));
}

test("実在する部分が無い道筋は元の道筋のまま比べ、中なら止めない", () => {
  assert.equal(decide(edit("/w/wt/a.txt"), fakeGit()), null);
});

test("本物の git でも、worktree へのリンクを作業フォルダにした編集と git 操作は止めない", () => {
  withRepo(({ base, wt }) => {
    const link = join(base, "link2");
    symlinkSync(wt, link);
    assert.equal(decide(edit(`${link}/a.txt`, { cwd: link }), guardModule.realGit), null);
    assert.equal(decide(bash("git add -A", { cwd: link }), guardModule.realGit), null);
  });
});

test("本物の git で、メインの作業フォルダへのリンクを作業フォルダにしても (a)(b) は null", () => {
  withRepo(({ base, main }) => {
    const link = join(base, "link3");
    symlinkSync(main, link);
    assert.equal(decide(bash("git commit -m x", { cwd: link }), guardModule.realGit), null);
    assert.equal(decide(edit(`${link}/a.txt`, { cwd: link }), guardModule.realGit), null);
  });
});

// ---------- 修正 8: ヒアドキュメントの中身をコマンドとして読まない ----------
const HEREDOC_SPLIT = [
  ["cat > plan.md <<EOF\ngit -C /w/main checkout main\nEOF", ["cat > plan.md <<EOF"]],
  ["cat > x.md <<-EOF\n\tgit push\n\tEOF\ngit status", ["cat > x.md <<-EOF", "git status"]],
  ["cat <<EOF\nbody && git push; x | y\nEOF\ngit status", ["cat <<EOF", "git status"]],
  ["cat <<< foo\ngit -C /w/main commit -m x", ["cat <<< foo", "git -C /w/main commit -m x"]],
  ["cat <<EOF\ngit push\ngit status", ["cat <<EOF", "git push", "git status"]],
  ["cat <<EOF\nEOF", ["cat <<EOF"]],
  ['git commit -m "a << b"\ngit log', ['git commit -m "a << b"', "git log"]],
  ["cat << EOF\ngit push\nEOF\ngit status", ["cat << EOF", "git status"]],
];
test("splitSegments はヒアドキュメントの本文と終端行を断片にしない", () => {
  for (const [cmd, want] of HEREDOC_SPLIT) assert.deepEqual(splitSegments(cmd), want, JSON.stringify(cmd));
});

const OUT = "git -C /w/main commit -m x";
const HEREDOC_ROWS = [
  ["ヒアドキュメント本文中の git 行は判定しない", bash(`cat > plan.md <<EOF\n${OUT}\nEOF`), null],
  ["単一引用符の終端語でも本文は読まない", bash(`cat > x.md <<'EOF'\n${OUT}\nEOF`), null],
  ["二重引用符の終端語でも本文は読まない", bash(`cat > x.md <<"EOF"\n${OUT}\nEOF`), null],
  ["<<- は先頭のタブを除いて終端とし、本文は読まない", bash(`cat > x.md <<-EOF\n\t${OUT}\n\tEOF`), null],
  ["ヒアドキュメントの終端行より後ろの行は判定する", bash(`cat > x.md <<'EOF'\nbody\nEOF\n${OUT}`), "deny"],
  ["ヒアドキュメントより前の行は判定する", bash(`${OUT}\ncat <<EOF\nbody\nEOF`), "deny"],
  ["<<WORD と同じ行の残り（パイプの後ろ）は判定する", bash("cat <<EOF | git -C /w/main commit -F -\nbody\nEOF"), "deny"],
  ["引用符の中の << はヒアドキュメントの始まりにしない", bash(`echo "<<EOF"\n${OUT}`), "deny"],
  ["単一引用符の中の << も始まりにしない", bash(`git commit -m 'a <<EOF'\n${OUT}`), "deny"],
  ["終端行が無ければヒアドキュメントとみなさず、後ろの行を判定する", bash(`cat <<EOF\n${OUT}\n`), "deny"],
  ["WORD の後ろに文字がある行は終端にならず、本物の終端まで本文", bash(`cat <<EOF\nEOF extra\n${OUT}\nEOF\ngit status`), null],
  ["<<- でもスペース字下げの終端語は終端にならず本文が続く", bash(`cat <<-EOF\n  EOF\n${OUT}\nEOF`), null],
  ["<<（ダッシュ無し）では先頭にタブのある行は終端にならず本文が続く", bash(`cat <<EOF\n\tEOF\n${OUT}\nEOF`), null],
  ["ヒアドキュメント開始行にある cd 先と git は判定する", bash("cd /w/main && git commit -F - <<EOF\nmsg\nEOF"), "deny"],
  ["連続する 2 つのヒアドキュメントの本文を飛ばし、最後の行だけ判定する", bash(`cat <<A\nx\nA\ncat <<B\n${OUT}\nB\ngit -C /w/main merge y`), "ask"],
  ["<< と WORD の間に空白があっても本文は読まない", bash(`cat > x.md << EOF\n${OUT}\nEOF`), null],
  ["空白と引用符付きの終端語でも、終端行より後ろは判定する", bash(`cat > x.md << 'EOF'\nbody\nEOF\n${OUT}`), "deny"],
];
checkRows(HEREDOC_ROWS);

// ---------- 修正 8 改め: 終わりの行が無い << はヒアドキュメントではない ----------
const HEREDOC_UNTERMINATED_ROWS = [
  ["算術展開 $((1<<2)) の次の行の git は判定する", bash(`echo $((1<<2))\n${OUT}`), "deny"],
  ["算術コマンド (( x << 3 )) の次の行の git は判定する", bash(`(( x << 3 ))\n${OUT}`), "deny"],
  ["コメント中の <<EOF の次の行の git は判定する", bash(`# note: use <<EOF\n${OUT}`), "deny"],
  ["終わりの行が無い cat <<EOF の次の行の git は判定する", bash(`cat <<EOF\n${OUT}`), "deny"],
  ["終わりの行がある本物のヒアドキュメントの本文は読まない", bash(`cat <<EOF\n${OUT}\nEOF`), null],
  ["2 つ目のヒアドキュメントにだけ終わりの行が無ければ、2 つ目の次の行は判定する", bash(`cat <<A\nx\nA\ncat <<B\n${OUT}`), "deny"],
  ["1 つ目にだけ終わりの行が無く 2 つ目が終わっていれば、2 つ目の本文は読まない", bash(`cat <<A\ncat <<B\n${OUT}\nB`), null],
  ["<<- で終わりの行が無ければ次の行の git は判定する", bash(`cat <<-EOF\n\t${OUT}`), "deny"],
  ["<<- でスペース字下げの終わり語だけなら終わりと見ず、次の行の git は判定する", bash(`cat <<-EOF\n  EOF\n${OUT}`), "deny"],
];
checkRows(HEREDOC_UNTERMINATED_ROWS);

test("splitSegments は算術展開の << の次の行を断片に含める", () => {
  assert.ok(splitSegments(`echo $((1<<2))\n${OUT}`).includes(OUT));
});
test("splitSegments は終わりの行が無い << の次の行を断片に含める", () => {
  assert.deepEqual(splitSegments(`cat <<EOF\n${OUT}`), ["cat <<EOF", OUT]);
});

// ---------- 修正 9: 会話の一時フォルダの中の git は (b) で止めない ----------
const S1 = `${SCR}/s1/scratchpad`;
const S2 = `${SCR}/s2/scratchpad`;
// push の枝は行き先ごとに変える。行き先以外の枝を見て判定していれば結果が逆になる
const branchAt = (atScratch, elsewhere) => fakeGit({ currentBranch: (d) => (d === `${S1}/try` ? atScratch : elsewhere) });
const SCRATCH_ROWS = [
  ["-C の行き先が自分の一時フォルダなら止めない", bash(`git -C ${S1}/try commit -m x`), null],
  ["cd で移った先が自分の一時フォルダなら止めない", bash(`cd ${S1}/try && git commit -m x`), null],
  ["一時フォルダの深い階層も中として扱う", bash(`git -C ${S1}/a/b/c commit -m x`), null],
  ["一時フォルダの中の init は止めない", bash(`git -C ${S1}/try init`), null],
  ["一時フォルダの中の merge は確認も求めない", bash(`git -C ${S1}/try merge topic`), null],
  ["別の会話の一時フォルダは外のまま止める", bash(`git -C ${S2}/try commit -m x`), "deny"],
  ["/tmp のそれ以外の場所は外のまま止める", bash("git -C /tmp/other commit -m x"), "deny"],
  ["session_id が接頭辞だけ一致する別の id は止める", bash(`git -C ${SCR}/s1x/scratchpad/try commit -m x`), "deny"],
  ["scratchpad-x は一時フォルダではないので止める", bash(`git -C ${SCR}/s1/scratchpad-x/try commit -m x`), "deny"],
  ["行き先が複数なら一時フォルダを除いた残りで判定する", bash(`git -C ${S1}/try commit -m x && git -C /tmp/other commit -m y`), "deny"],
  ["行き先がすべて一時フォルダなら残りが無く止めない", bash(`git -C ${S1}/try commit -m x && git -C ${S1}/t2 commit -m y`), null],
  ["session_id が無ければ一時フォルダを例外にできず止める", bash(`git -C ${S1}/try commit -m x`, { session_id: undefined }), "deny"],
  ["(a) 回帰: 自分の一時フォルダへの Write は通す", edit(`${S1}/a.txt`), null],
  ["(c) 一時フォルダの行き先が main なら push は確認する", bash(`git -C ${S1}/try push`), "ask", [], branchAt("main", "feature/y")],
  ["(c) 行き先が feature なら、ほかが main でも push を止めない", bash(`git -C ${S1}/try push`), null, [], branchAt("feature/y", "main")],
  ["(c) cd で移った先が main なら push は確認する", bash(`cd ${S1}/try && git push`), "ask", [], branchAt("main", "feature/y")],
];
checkRows(SCRATCH_ROWS);
