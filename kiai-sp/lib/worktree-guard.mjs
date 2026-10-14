#!/usr/bin/env node
/**
 * worktree-guard.mjs
 *
 * PreToolUse / UserPromptSubmit フックの入出力。kiai-sp のスキルを起動した会話でだけ、
 * worktree の外への操作と trunk 系ブランチでの push を止める。
 *
 *   (a) サブエージェントが、いまの worktree の外にあるファイルを編集する → deny
 *   (b) git に別のフォルダを指定して worktree の外を操作する → 読み取りは素通し、merge は ask、他は deny
 *       （この会話の一時フォルダの中は外として扱わない。(c) には効かせない）
 *   (c) trunk 系のブランチでの git push → ask
 *
 * "allow" は返さない。返すと利用者自身の権限設定による確認を飛ばしてしまうため。
 * 判定中の例外は通さず ask に倒す。git が失敗したときも同じ（git の管理外という正常な答えだけは「worktree ではない」）。
 *
 * AI が普段打つ書き方は追う。わざわざ遠回りする書き方は追わない。全部を塞ごうとすると、
 * worktree の中での普段の作業を誤って止めるため。
 * 追うもの: 環境変数・env / sudo などの前置き・フルパスの git、& や引用符を含む区切り、
 *   ~ と $ を含む行き先、-C の重ね掛け、cd / pushd で移動してからの git。
 * 追わないもの（対象外）:
 *   - bash -c / sh -c など、別のシェルに文字列を渡して動かす形
 *   - eval
 *   - xargs git など、別のコマンドの引数として git を動かす形
 *   - $(...) とバッククォートの中のコマンド
 *   - 前置きのコマンドにオプションの値を渡す形（sudo -u 名前 git など）
 *   - trunk 系以外のブランチから trunk 系のブランチ名を指定して push する形（git push origin HEAD:main）。
 *     設計書は「trunk 系のブランチにいるとき」を対象にした
 *   - ヒアドキュメントではない << （コメントの中など）が、後ろにある本物のヒアドキュメントの終わりの行と
 *     同じ語を使う形。あいだの行はヒアドキュメントの中身として読まない
 *   - 外を指す壊れたシンボリックリンク越しの編集（実在する祖先で比べるため中と見なす）
 *
 * 中か外かを比べる前に、道筋は実在する最深の部分をシンボリックリンクを解いた実体に揃える。
 * git が返す worktree の最上位は実体の道筋なので、揃えないと作業フォルダがリンク経由のときに誤って外と判定する。
 * ヒアドキュメントの本文は文章であってコマンドではないので、断片に分けるときに読み飛ばす。
 *
 * 装填の記録は spec-testing/guard-state.mjs をフォルダ名だけ変えて使う。
 * gate-state.mjs を使わないのは、あちらの装填が spec / plan のレビュー記録の検証と
 * 一体になっていて、装填の範囲を広げると検証の範囲まで変わってしまうため。
 *
 * export:
 *   GUARD_DIR / TRUNK_NAMES / EDIT_TOOLS
 *   splitSegments(command) / parseGitInvocation(segment) / isReadOnlyGit(subcommand, rest)
 *   isTrunk(branch, defaultBranch) / decide(input, git) / realGit
 *   handleWorktreeGuard(input, opts) → フックの出力 | null
 *
 * CLI:
 *   node worktree-guard.mjs < hook-input.json
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { armGuard, readGuard } from "./spec-testing/guard-state.mjs";

export const GUARD_DIR = "kiai-sp-worktree-guard";
export const TRUNK_NAMES = ["main", "master", "develop", "trunk"];
export const EDIT_TOOLS = ["Write", "Edit", "NotebookEdit"];

const ARM_PLUGIN_PREFIX = "kiai-sp:";
const ARM_PROMPT_RE = /^\s*\/kiai-sp:/;
const PATH_OPTIONS = ["-C", "--git-dir", "--work-tree"];
const CONFIG_OPTIONS = ["-c", "--config-env", "--exec-path"];
const ENV_DESTS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"];
const WRAPPERS = ["env", "command", "sudo", "time", "nohup"];

const HEREDOC_RE = /^<<(-?)[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s;&|<>()"']+))/;

// 引用符の中の区切りは区切りにしない。>& &> <& の & はリダイレクトであって「後ろで動かす」指定ではない。
// ヒアドキュメントは、開始行の次の行から終端行までを捨てる。
// 終端行が無い << は算術展開やコメントの << かもしれず、本文として捨てると後ろの行を隠す抜け道になるので、
// ヒアドキュメントとみなさず、次の行以降も断片として読む。
export function splitSegments(command) {
  const s = String(command ?? "");
  const segments = [];
  let cur = "";
  let quote = null;
  const heredocs = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<" && s[i + 1] === "<") {
      if (s[i + 2] === "<") {
        cur += "<<<";
        i += 2;
        continue;
      }
      const m = HEREDOC_RE.exec(s.slice(i));
      if (m) heredocs.push({ strip: m[1] === "-", word: m[2] ?? m[3] ?? m[4] });
      cur += "<<";
      i += 1;
      continue;
    } else {
      const sepLen =
        s.startsWith("&&", i) || s.startsWith("||", i)
          ? 2
          : c === ";" || c === "|" || c === "\n" || (c === "&" && !/[<>]/.test(s[i - 1] ?? "") && s[i + 1] !== ">")
            ? 1
            : 0;
      if (sepLen) {
        segments.push(cur);
        cur = "";
        i += sepLen - 1;
        if (c === "\n") {
          let j = i + 1;
          for (const { strip, word } of heredocs.splice(0)) {
            let k = j;
            while (k < s.length) {
              const end = s.indexOf("\n", k);
              const line = end < 0 ? s.slice(k) : s.slice(k, end);
              k = end < 0 ? s.length : end + 1;
              if ((strip ? line.replace(/^\t+/, "") : line) === word) {
                j = k;
                break;
              }
            }
          }
          i = j - 1;
        }
        continue;
      }
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map((x) => x.trim()).filter((x) => x !== "");
}

// 先頭の ( { ! と語としての then do else、末尾の ) } は、コマンドの一部ではないので落とす。
function words(segment) {
  const tokens = (segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((t) =>
    t.replace(/"([^"]*)"|'([^']*)'/g, "$1$2"),
  );
  while (tokens.length) {
    if (["then", "do", "else"].includes(tokens[0])) tokens.shift();
    else if (/^[({!]/.test(tokens[0])) {
      tokens[0] = tokens[0].slice(1);
      if (tokens[0] === "") tokens.shift();
    } else break;
  }
  while (tokens.length && (tokens[tokens.length - 1] = tokens.at(-1).replace(/[)}]+$/, "")) === "") tokens.pop();
  return tokens;
}

const basename = (t) => t.slice(t.lastIndexOf("/") + 1);

function parseGit(tokens) {
  const dests = [];
  let hasConfigOverride = false;
  let i = 0;
  for (; i < tokens.length; i++) {
    const env = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(tokens[i]);
    if (env) {
      if (ENV_DESTS.includes(env[1])) dests.push({ kind: "dir", path: env[2] });
      else if (env[1].startsWith("GIT_CONFIG") || env[1] === "GIT_EXEC_PATH") hasConfigOverride = true;
    } else if (WRAPPERS.includes(basename(tokens[i]))) {
      while (tokens[i + 1]?.startsWith("-")) i++;
    } else break;
  }
  if (basename(tokens[i] ?? "") !== "git") return null;

  for (i++; i < tokens.length; i++) {
    const t = tokens[i];
    if (PATH_OPTIONS.includes(t)) {
      if (i + 1 < tokens.length) dests.push({ kind: t === "-C" ? "C" : "dir", path: tokens[++i] });
      continue;
    }
    const pathEq = PATH_OPTIONS.find((o) => o.startsWith("--") && t.startsWith(`${o}=`));
    if (pathEq) {
      dests.push({ kind: "dir", path: t.slice(pathEq.length + 1) });
      continue;
    }
    if (CONFIG_OPTIONS.includes(t)) {
      hasConfigOverride = true;
      i++;
      continue;
    }
    if (CONFIG_OPTIONS.some((o) => t.startsWith(`${o}=`))) {
      hasConfigOverride = true;
      continue;
    }
    if (t === "--namespace") {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue;
    return { dests, hasConfigOverride, subcommand: t, rest: tokens.slice(i + 1) };
  }
  return { dests, hasConfigOverride, subcommand: null, rest: [] };
}

export function parseGitInvocation(segment) {
  const g = parseGit(words(segment));
  return g && { externalPaths: g.dests.map((d) => d.path), hasConfigOverride: g.hasConfigOverride, subcommand: g.subcommand, rest: g.rest };
}

const ALWAYS_READ = new Set([
  "status", "log", "diff", "show", "rev-parse", "rev-list", "ls-files", "ls-tree", "blame",
  "shortlog", "cat-file", "for-each-ref", "describe", "ls-remote", "fetch", "count-objects",
  "verify-commit", "verify-pack",
]);
const BRANCH_WRITE = [
  "-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move", "--copy", "--edit-description",
  "--set-upstream-to", "-u", "--unset-upstream", "--track", "--no-track",
];
const BRANCH_FILTER = ["--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--list", "-l"];
const TAG_WRITE = [
  "-a", "-s", "-u", "-f", "-d", "-v", "--annotate", "--sign", "--local-user", "--force", "--delete",
  "--verify", "-m", "-F", "--message", "--file", "--cleanup", "--edit",
];
const TAG_LIST = [
  "-l", "--list", "-n", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at",
  "--sort", "--format", "--column", "--no-column",
];
const CONFIG_READ = ["--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--show-origin", "--show-scope"];

export function isReadOnlyGit(subcommand, rest = []) {
  if (!subcommand) return false;
  if (ALWAYS_READ.has(subcommand)) return true;

  const positionals = rest.filter((t) => !t.startsWith("-"));
  const flags = rest.filter((t) => t.startsWith("-"));
  const first = positionals[0];
  const hasAny = (targets) => flags.some((f) => targets.includes(f) || targets.some((t) => f.startsWith(`${t}=`)));

  switch (subcommand) {
    case "branch":
      if (hasAny(BRANCH_WRITE)) return false;
      if (hasAny(BRANCH_FILTER)) return true;
      return positionals.length === 0;
    case "tag":
      if (hasAny(TAG_WRITE)) return false;
      if (hasAny(TAG_LIST) || flags.some((f) => f.startsWith("-n"))) return true;
      return positionals.length === 0;
    case "config":
      return hasAny(CONFIG_READ);
    case "remote":
      return positionals.length === 0 || first === "show" || first === "get-url";
    case "stash":
      return first === "list" || first === "show";
    case "worktree":
      return first === "list";
    case "reflog":
      return positionals.length === 0 || first === "show" || first === "exists";
    default:
      return false;
  }
}

export function isTrunk(branch, defaultBranch) {
  if (branch == null) return true;
  return TRUNK_NAMES.includes(branch) || branch === defaultBranch;
}

// 実在する最深の祖先を実体に直し、まだ無い残りをそのまま後ろにつなぐ。何も実在しなければ元のまま。
function canon(path) {
  const rest = [];
  for (let p = path; ; p = dirname(p)) {
    try {
      return join(realpathSync(p), ...rest);
    } catch {
      if (dirname(p) === p) return path;
      rest.unshift(p.slice(dirname(p).length).replace(/^\/+/, ""));
    }
  }
}

function isInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// Claude Code が会話ごとに用意する一時フォルダ（.../claude-<uid>/<project>/<session_id>/scratchpad/...）
function isSessionScratchpad(target, sessionId) {
  if (!sessionId) return false;
  const parts = target.split(sep);
  return parts.some(
    (p, i) => /^claude-\d+$/.test(p) && parts[i + 2] === sessionId && parts[i + 3] === "scratchpad",
  );
}

const EXIT_HINT =
  'ExitWorktree（action: "keep"）で元のフォルダに戻ってから実行すること。' +
  "権限が無いと判断して人間にコマンドを渡す前に、まずこれを試すこと。";

const reasons = {
  edit: (root, target) =>
    `サブエージェントは、いまの worktree（${root}）の外にあるファイルを編集できない: ${target}\n` +
    "worktree の中の対応するファイルを編集すること。worktree の外を直す必要があるなら、編集せずに親エージェントへ報告すること。",
  gitDeny: (root, configOverride) =>
    `worktree（${root}）の中から、その外を対象に状態を変える git 操作はできない。\n` +
    `元のフォルダで実行する必要があるなら、${EXIT_HINT}` +
    (configOverride ? "\ngit の設定を書き換える指定（-c / --config-env / --exec-path / GIT_CONFIG 系の環境変数）も付けないこと。" : ""),
  gitMerge: (root) =>
    `worktree（${root}）の外を対象にしたマージには人間の確認が要る。\n` +
    '先に ExitWorktree（action: "keep"）で元のフォルダに戻り、そこで git merge を実行すれば、この確認は出ない。',
  undecided: () =>
    "git の行き先のフォルダが決められないので、人間の確認を求める。\n" +
    "~名前・$・バッククォート・cd - などを含まない、具体的なパスで指定すれば、この確認は出ない。",
  push: (branch) =>
    `trunk 系のブランチ（${branch ?? "名前不明"}）からの push には人間の確認が要る。\n` +
    "kiai-sp では trunk 系のブランチで直接作業しない。作業用のブランチに移ってから push すること。",
  error: (err) => `worktree の外への操作を止める判定でエラーが起きたため、人間の確認を求める: ${err?.message ?? err}`,
};

function decideEdit(input, cwd, git) {
  if (input?.agent_id == null) return null;
  if (!git.isInWorktree(cwd)) return null;
  const gitRoot = git.worktreeRoot(cwd);
  if (!gitRoot) return null;
  const root = canon(gitRoot);

  const toolInput = input?.tool_input ?? {};
  const filePath = input.tool_name === "NotebookEdit" ? toolInput.notebook_path : toolInput.file_path;
  if (!filePath) return null;

  const target = canon(resolve(cwd, filePath));
  if (isInside(root, target) || isSessionScratchpad(target, input?.session_id)) return null;
  return { decision: "deny", reason: reasons.edit(root, target) };
}

// 決められない行き先は null。
function resolveDir(path, base) {
  let p = path;
  if (p === "~" || p.startsWith("~/")) p = homedir() + p.slice(1);
  else if (p.startsWith("~")) return null;
  if (/[$`]/.test(p)) return null;
  if (isAbsolute(p)) return resolve(p);
  return base === null ? null : resolve(base, p);
}

// -C は git と同じく順に効く。--git-dir などの相対パスは、-C を全部適用した後の場所が起点。
// 途中の -C の行き先は判定しない。
function targetDirs(inv, wd) {
  if (inv.dests.length === 0) return [wd];
  const chdirs = inv.dests.filter((d) => d.kind === "C");
  let dir = wd;
  for (const d of chdirs) dir = resolveDir(d.path, dir);
  const dirs = inv.dests.filter((d) => d.kind === "dir").map((d) => resolveDir(d.path, dir));
  return [...(chdirs.length ? [dir] : []), ...dirs];
}

// 自分の会話の一時フォルダ宛ては外として数えない。push の判定（decidePush）には効かせない。
function decideOutsideGit(inv, wd, root, sessionId) {
  if (!root) return null;
  root = canon(root);
  const targets = targetDirs(inv, wd)
    .map((t) => t && canon(t))
    .filter((t) => t === null || !isSessionScratchpad(t, sessionId));
  if (targets.length === 0) return null;
  const outside = targets.some((t) => t !== null && !isInside(root, t));
  if (!outside && !targets.includes(null)) return null;

  const merge = inv.subcommand === "merge";
  if (!outside) {
    return isReadOnlyGit(inv.subcommand, inv.rest) && !inv.hasConfigOverride ? null : { decision: "ask", reason: reasons.undecided() };
  }
  if (inv.hasConfigOverride) {
    return merge ? { decision: "ask", reason: reasons.gitMerge(root) } : { decision: "deny", reason: reasons.gitDeny(root, true) };
  }
  if (isReadOnlyGit(inv.subcommand, inv.rest)) return null;
  if (merge) return { decision: "ask", reason: reasons.gitMerge(root) };
  return { decision: "deny", reason: reasons.gitDeny(root, false) };
}

function decidePush(inv, wd, git) {
  if (inv.subcommand !== "push") return null;
  const dir = targetDirs(inv, wd).at(-1);
  if (dir === null) return { decision: "ask", reason: reasons.undecided() };
  const branch = git.currentBranch(dir);
  if (!isTrunk(branch, git.defaultBranch(dir))) return null;
  return { decision: "ask", reason: reasons.push(branch) };
}

// 括弧の中の cd も外に効くものとして扱う（止める側に倒す）。
function nextWorkingDir(tokens, wd) {
  const [cmd, ...args] = tokens;
  if (cmd === "popd") return null;
  if (cmd !== "cd" && cmd !== "pushd") return wd;
  const target = args.find((a) => a === "-" || !a.startsWith("-"));
  return target === "-" ? null : resolveDir(target ?? "~", wd);
}

function decideBash(input, cwd, git) {
  const verdicts = [];
  let wd = cwd;
  let worktree;
  const rootOf = () => (worktree ??= { root: (git.isInWorktree(cwd) && git.worktreeRoot(cwd)) || null }).root;
  for (const segment of splitSegments(input?.tool_input?.command)) {
    const tokens = words(segment);
    const inv = parseGit(tokens);
    if (!inv) {
      wd = nextWorkingDir(tokens, wd);
      continue;
    }
    for (const v of [decideOutsideGit(inv, wd, rootOf(), input?.session_id), decidePush(inv, wd, git)]) {
      if (v) verdicts.push(v);
    }
  }
  return verdicts.find((v) => v.decision === "deny") ?? verdicts[0] ?? null;
}

export function decide(input, git) {
  const cwd = input?.cwd ?? process.cwd();
  if (EDIT_TOOLS.includes(input?.tool_name)) return decideEdit(input, cwd, git);
  if (input?.tool_name === "Bash") return decideBash(input, cwd, git);
  return null;
}

// 「git の管理下ではない」は正常な答えとして null。それ以外の失敗は握りつぶさず投げる
// （握りつぶすと worktree の外にいるものとして素通しになるため）。
// 言語設定で文言が翻訳されると判別できないので C ロケールで動かす。
function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (err.status === 128 && /not a git repository/.test(String(err.stderr))) return null;
    throw err;
  }
}

export const realGit = {
  // git-dir と git-common-dir が異なれば、連結された worktree の中にいる。
  // サブモジュールでは両者が一致するので worktree とは見なさない。
  isInWorktree(cwd) {
    const out = runGit(cwd, ["rev-parse", "--absolute-git-dir", "--git-common-dir"]);
    if (!out) return false;
    const [gitDir, commonDir] = out.split("\n");
    // cwd がリンク経由だと相対の commonDir の起点がずれるので、両方を実体にして比べる。
    return canon(resolve(gitDir)) !== canon(resolve(canon(cwd), commonDir));
  },
  worktreeRoot: (cwd) => runGit(cwd, ["rev-parse", "--show-toplevel"]) || null,
  // detached HEAD では空文字が返るので null にする。
  currentBranch: (cwd) => runGit(cwd, ["branch", "--show-current"]) || null,
  // ネットワークに出ない手段だけを使う。取れなければ null（trunk 名だけで判定する）。
  defaultBranch(cwd) {
    try {
      return runGit(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])?.replace(/^origin\//, "") || null;
    } catch {
      return null;
    }
  },
};

function ask(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  };
}

export function handleWorktreeGuard(input, opts = {}) {
  const { root = tmpdir(), git = realGit, now } = opts;
  const sessionId = input?.session_id;
  const arm = () => {
    if (sessionId) armGuard(sessionId, { root, dirName: GUARD_DIR, now });
    return null;
  };

  if (input?.tool_name === "Skill") {
    if (String(input?.tool_input?.skill ?? "").startsWith(ARM_PLUGIN_PREFIX)) return arm();
  }
  if (input?.hook_event_name === "UserPromptSubmit") {
    return ARM_PROMPT_RE.test(String(input?.prompt ?? "")) ? arm() : null;
  }
  if (!readGuard(sessionId, { root, dirName: GUARD_DIR })) return null;

  let verdict;
  try {
    verdict = decide(input, git);
  } catch (err) {
    return ask(reasons.error(err));
  }
  if (!verdict) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
    },
  };
}

if (process.argv[1]?.endsWith("worktree-guard.mjs")) {
  let input = null;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
    const output = handleWorktreeGuard(input);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (err) {
    // UserPromptSubmit に PreToolUse の判定を返すと形が合わないので、そのときは黙って通す。
    if (input?.hook_event_name !== "UserPromptSubmit") process.stdout.write(JSON.stringify(ask(reasons.error(err))));
  }
  process.exit(0);
}
