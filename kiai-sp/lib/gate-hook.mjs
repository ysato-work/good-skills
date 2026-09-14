/**
 * gate-hook.mjs
 *
 * hook の入力 JSON を解析し、PreToolUse / Stop の出力 JSON を組み立てる。
 *
 * PreToolUse:  kiai-sp:brainstorming / kiai-sp:writing-plans の起動で装填し、
 *              実装スキルの起動時に plan の記録を検証して deny 判定する。
 * PostToolUse: spec / plan への Write / Edit をセッション台帳に記録する。
 * Stop:        装填時刻以降に更新された spec / plan を全件検証し、block 判定する。
 *             ただし in-flight なバックグラウンド作業がある間は block せず
 *             警告のみに落とす（移譲中は「終了」ではなく「待機」だから）。
 *
 * 装填判定 (armSkillNameOf) と deny 判定 (skillNameOf) でスキル名の
 * 解決方法が異なる。装填は `kiai-sp:` 接頭辞を必須にし、他プラグインの
 * 同名スキル（例: `superpowers:brainstorming`）で誤って装填しない。
 * 一方、deny 判定は引き続きプラグイン接頭辞を落として比較する。
 * `writing-plans/SKILL.md` が `superpowers:subagent-driven-development` を
 * 参照しているため、ここで接頭辞を要求すると deny 判定が機能しなくなる。
 *
 * export:
 *   skillNameOf(input)        → プラグイン接頭辞を落としたスキル名（deny 判定用）
 *   armSkillNameOf(input)     → `kiai-sp:` 接頭辞必須のスキル名（装填判定用）
 *   renderFailures(failures)  → 人間とエージェントに返す理由文
 *   inFlightCount(input)      → in-flight なバックグラウンド作業の件数
 *   renderDeferral(failures)  → 検証を保留したことを人間に伝える 1 行
 *   handleArm(input, opts)    → PreToolUse の出力 | null
 *   handleRecord(input, opts) → 常に null（台帳への記録が副作用）
 *   handleVerify(input, opts) → Stop の出力 | null
 *
 * CLI:
 *   node gate-hook.mjs arm     < hook-input.json
 *   node gate-hook.mjs record  < hook-input.json
 *   node gate-hook.mjs verify  < hook-input.json
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arm, readState, recordWrite } from "./gate-state.mjs";
import { isReviewTarget, verifyAll } from "./review-record.mjs";

export const ARM_SKILLS = ["brainstorming", "writing-plans"];
export const GATED_SKILLS = ["subagent-driven-development", "executing-plans"];
export const RECORDED_TOOLS = ["Write", "Edit"];
const ARM_PLUGIN_PREFIX = "kiai-sp:";
const REVIEW_RECORD_PATH = fileURLToPath(new URL("./review-record.mjs", import.meta.url));

export function skillNameOf(input) {
  const raw = input?.tool_input?.skill ?? "";
  return String(raw).split(":").pop();
}

export function armSkillNameOf(input) {
  const raw = String(input?.tool_input?.skill ?? "");
  return raw.startsWith(ARM_PLUGIN_PREFIX) ? raw.slice(ARM_PLUGIN_PREFIX.length) : "";
}

export function renderFailures(failures) {
  return [
    "セルフレビューの記録が無いため完了できない。",
    ...failures.map((f) => `- ${f.target}: ${f.reason}`),
    "",
    "各ファイルについてスキル定義のセルフレビュー観点を実施し、",
    `${REVIEW_RECORD_PATH} の write サブコマンドで記録を書いてから再度終了すること。`,
  ].join("\n");
}

/**
 * Stop hook 入力の in-flight なバックグラウンド作業の件数を返す。
 *
 * `background_tasks` を送らない旧バージョンの Claude Code、および
 * 想定外の型で届いた場合はいずれも 0 件として扱い、従来どおり block させる。
 */
export function inFlightCount(input) {
  return Array.isArray(input?.background_tasks) ? input.background_tasks.length : 0;
}

export function renderDeferral(failures) {
  const names = failures.map((f) => basename(f.target)).join(", ");
  return `バックグラウンド待ちのためセルフレビュー記録の検証を保留: ${names}`;
}

export function handleArm(input, opts = {}) {
  const armSkill = armSkillNameOf(input);

  if (ARM_SKILLS.includes(armSkill)) {
    arm(input.session_id, armSkill, opts);
    return null;
  }

  const skill = skillNameOf(input);
  if (GATED_SKILLS.includes(skill)) {
    const state = readState(input.session_id, opts);
    if (!state) return null;
    const { ok, failures } = verifyAll(state.writes, { plansOnly: true });
    if (!ok) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: renderFailures(failures),
        },
      };
    }
  }

  return null;
}

/**
 * spec / plan への書き込みをセッション台帳に記録する。
 *
 * 出力は常に無い。PostToolUse でツールの結果に介入する必要はなく、
 * 台帳への追記だけが目的だから。
 */
export function handleRecord(input, opts = {}) {
  if (!RECORDED_TOOLS.includes(input?.tool_name)) return null;

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath === "") return null;

  const abs = resolve(input?.cwd ?? ".", filePath);
  if (!isReviewTarget(abs)) return null;

  recordWrite(input?.session_id, abs, opts);
  return null;
}

export function handleVerify(input, opts = {}) {
  const state = readState(input.session_id, opts);
  if (!state) return null;

  const { ok, failures } = verifyAll(state.writes);
  if (ok) return null;

  // 移譲が成立している間の block は、親エージェントに待機用の埋め草生成を
  // 強いるだけで記録は書けない。ここでは通し、バックグラウンドの完了で
  // 再起動した後の Stop で改めて検証する。
  if (inFlightCount(input) > 0) {
    return { systemMessage: renderDeferral(failures) };
  }

  return { decision: "block", reason: renderFailures(failures) };
}

if (process.argv[1]?.endsWith("gate-hook.mjs")) {
  const mode = process.argv[2];
  const input = JSON.parse(readFileSync(0, "utf8"));
  const HANDLERS = { arm: handleArm, record: handleRecord, verify: handleVerify };
  const output = (HANDLERS[mode] ?? handleVerify)(input);

  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
