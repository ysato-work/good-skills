#!/usr/bin/env node
/**
 * completion-hook.mjs
 *
 * 完走ゲートのフック入出力。テストスキルの起動で装填し、ターン終了時に台帳を検査して
 * 残件があればブロックする。詰まったら自分から降りる。
 *
 * 装填が無いセッションでは必ず null を返す。人の通常作業のターン終了を止めない。
 * これがこのモジュールで一番大事な性質である。
 *
 * 降りるときは装填を消す。消さないと、次のターンでも同じ判定になって同じ報告を
 * 繰り返す。一度降りたら、その旨は stop-report.json に残っている。
 *
 * 既存の Stop ゲート（セルフレビューの記録検証）とは別物である。あちらは触らず、
 * Stop 配列に 2 本目として並ぶ。
 *
 * export:
 *   armSkillNameOf(input) / inFlightCount(input)
 *   handleArm(input, opts)    → 常に null（装填が副作用）
 *   handleVerify(input, opts) → Stop の出力 | null
 *
 * CLI:
 *   node completion-hook.mjs arm    < hook-input.json
 *   node completion-hook.mjs verify < hook-input.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runCheck } from "./check-progress.mjs";
import {
  PHASE_BY_SKILL,
  armCompletion,
  disarmCompletion,
  readCompletion,
  recordTurn,
} from "./completion-state.mjs";
import {
  buildStopReport,
  decide,
  isDelivered,
  renderBlock,
  renderStop,
  resolveArtifactDir,
} from "./completion-gate.mjs";
import { readCases } from "./ledger.mjs";
import { casesPath } from "./paths.mjs";

const ARM_PLUGIN_PREFIX = "kiai-sp:";

export function armSkillNameOf(input) {
  const raw = String(input?.tool_input?.skill ?? "");
  return raw.startsWith(ARM_PLUGIN_PREFIX) ? raw.slice(ARM_PLUGIN_PREFIX.length) : "";
}

export function inFlightCount(input) {
  return Array.isArray(input?.background_tasks) ? input.background_tasks.length : 0;
}

export function handleArm(input, opts = {}) {
  const phase = PHASE_BY_SKILL[armSkillNameOf(input)];
  if (!phase) return null;
  armCompletion(input?.session_id, { phase, ...opts });
  return null;
}

export function handleVerify(input, opts = {}) {
  const state = readCompletion(input?.session_id, opts);
  if (!state) return null;

  const artifactDir = resolveArtifactDir(input?.cwd ?? ".");
  if (!artifactDir) return null;

  const check = runCheck({ dir: artifactDir, phase: state.phase });
  let progress = { total: 0, todo: 0, pass: 0, fail: 0, error: 0, out_of_scope: 0, reasons: [] };
  try {
    if (check.stdout) progress = JSON.parse(check.stdout);
  } catch {
    // 読めなくても既定値で報告する。ここで throw するとターン終了が壊れる。
  }

  const advanced = Number.isInteger(progress.advanced_this_turn) ? progress.advanced_this_turn : 0;
  const delivered = state.phase === "execution" ? isDelivered(artifactDir) : true;
  const verdict = decide({ state, checkCode: check.code, advanced, inFlight: inFlightCount(input), delivered });

  if (verdict.action === "allow") {
    recordTurn(input?.session_id, { blocked: false, advanced, ...opts });
    return null;
  }

  if (verdict.action === "defer") {
    return { systemMessage: `バックグラウンド待ちのため完走の検証を保留: ${verdict.reason}` };
  }

  if (verdict.action === "block") {
    recordTurn(input?.session_id, { blocked: true, advanced, ...opts });
    return { decision: "block", reason: renderBlock(progress, verdict.reason) };
  }

  let cases = [];
  try {
    cases = readCases(casesPath(artifactDir));
  } catch {
    // 読めなくても空配列で報告する。ここで throw すると Stop フック自体が壊れる。
  }

  const report = buildStopReport({ reason: verdict.reason, progress, phase: state.phase, cases });
  writeFileSync(join(artifactDir, "stop-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  disarmCompletion(input?.session_id, opts);

  return { systemMessage: renderStop(progress, verdict.reason) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  const input = JSON.parse(readFileSync(0, "utf8"));
  const output = (mode === "arm" ? handleArm : handleVerify)(input);
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
