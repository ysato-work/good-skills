#!/usr/bin/env node
/**
 * guard-hook.mjs
 *
 * PreToolUse フックの入出力。テストスキルの起動でガードを装填し、以降の Bash /
 * Edit / Write / NotebookEdit を判定して deny する。
 *
 * 装填が無いセッションでは必ず null を返す。人の通常作業を止めないためで、これが
 * このモジュールで一番大事な性質である。
 *
 * 装填の判定は `kiai-sp:` 接頭辞を必須にする。他プラグインの同名スキルで誤って
 * 装填しないため。
 *
 * 解除はセッション内で自動的に行わない。無人実行では装填が続くのが正しく、対話中に
 * 外したいときだけ CLI で明示的に外す。
 *
 * Write で既存のテストファイルを全置換するケース（oldString が渡らない）では、
 * classifyFile 単体では weaken-assertion 判定が効かない。classifyFile は純関数で
 * ファイルを読まない設計なので、この穴はここ（配線側）でディスク上の現在の内容を
 * 読んで oldString として補ってふさぐ。NotebookEdit も tool_input の形が
 * notebook_path / new_source と異なるだけで同じ穴を持つので、同じ補いを行う。
 *
 * export:
 *   TESTING_SKILLS / GUARDED_TOOLS
 *   armSkillNameOf(input) / classifyInput(input) / renderBlock(verdict)
 *   handleGuard(input, opts) → PreToolUse の出力 | null
 *
 * CLI:
 *   node guard-hook.mjs check   < hook-input.json
 *   node guard-hook.mjs disarm --session <session_id>
 */
import { existsSync, readFileSync } from "node:fs";
import { classifyBash } from "./forbidden-bash.mjs";
import { classifyFile, isTestFile } from "./forbidden-file.mjs";
import { armGuard, disarmGuard, readGuard } from "./guard-state.mjs";

/** ガードを装填するスキル。S3 と S4 はこの名前で作る */
export const TESTING_SKILLS = ["generating-spec-tests", "executing-spec-tests"];

export const GUARDED_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit"];

const ARM_PLUGIN_PREFIX = "kiai-sp:";

export function armSkillNameOf(input) {
  const raw = String(input?.tool_input?.skill ?? "");
  return raw.startsWith(ARM_PLUGIN_PREFIX) ? raw.slice(ARM_PLUGIN_PREFIX.length) : "";
}

/**
 * Write / NotebookEdit ツールで既存のテストファイルを全置換する呼び出しは
 * old_string を持たない。classifyFile に渡す oldString をディスク上の現在の内容で
 * 補う。ファイルが無ければ新規作成なので空文字のまま。読み込みに失敗してもフックを
 * クラッシュさせず、空文字にフォールバックする。
 */
function currentContentFor(filePath) {
  try {
    if (!existsSync(filePath)) return "";
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function classifyInput(input) {
  const toolInput = input?.tool_input ?? {};

  if (input?.tool_name === "Bash") {
    return classifyBash(toolInput.command ?? "");
  }

  const filePath =
    input?.tool_name === "NotebookEdit"
      ? (toolInput.notebook_path ?? "")
      : (toolInput.file_path ?? "");
  let oldString = toolInput.old_string ?? "";
  if ((input?.tool_name === "Write" || input?.tool_name === "NotebookEdit") && isTestFile(filePath)) {
    oldString = currentContentFor(filePath);
  }

  return classifyFile({
    filePath,
    oldString,
    newString: toolInput.new_string ?? "",
    content: toolInput.content ?? toolInput.new_source ?? "",
  });
}

export function renderBlock(verdict) {
  return [
    `テスト実行中のガードが止めた: ${verdict.ruleId}`,
    verdict.reason,
    "",
    "別の手段を選ぶこと。この禁止を迂回する形に書き換えて再実行しないこと。",
    "手段が無いなら、そのケースは対象外として理由とともに台帳に記録すること。",
  ].join("\n");
}

export function handleGuard(input, opts = {}) {
  if (TESTING_SKILLS.includes(armSkillNameOf(input))) {
    armGuard(input?.session_id, opts);
    return null;
  }

  if (!GUARDED_TOOLS.includes(input?.tool_name)) return null;
  if (!readGuard(input?.session_id, opts)) return null;

  const verdict = classifyInput(input);
  if (!verdict.blocked) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: renderBlock(verdict),
    },
  };
}

if (process.argv[1]?.endsWith("guard-hook.mjs")) {
  const mode = process.argv[2];

  if (mode === "disarm") {
    const i = process.argv.indexOf("--session");
    const sessionId = i === -1 ? null : process.argv[i + 1];
    if (!sessionId) {
      process.stderr.write("--session に session_id を指定する\n");
      process.exit(2);
    }
    disarmGuard(sessionId);
    process.exit(0);
  }

  const output = handleGuard(JSON.parse(readFileSync(0, "utf8")));
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
