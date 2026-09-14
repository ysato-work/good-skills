/**
 * completion-gate.mjs
 *
 * ターン終了時に、残件があるのに終わろうとしていないかを判定する。純関数だけを持つ。
 *
 * ブロックし続けるだけでは完走しない。ターン終了フックは 8 回連続でブロックすると
 * Claude Code 側に上書きされてターンが終わる。上書きされると「残件があるのに正常
 * 終了した」ように見え、無人実行ではそれに気づけない。
 *
 * だから 2 つの上限を先に置く。前進 0 のターンが続いた回数と、連続ブロック回数。
 * どちらかが上限に達したらブロックをやめ、失敗として読める報告を出して降りる。
 * **気づける失敗のほうが、気づけない成功より価値がある。**
 *
 * 検査できなかった（終了コード 2）も止める。「まだ終わっていない」と「そもそも
 * 検査できなかった」を同じ扱いにすると、台帳が壊れているだけの状態で永久に
 * ブロックし続ける。
 *
 * 成果物ディレクトリはターン終了時に走査して決める。装填時には掘られていないので
 * 事前に受け渡せない。テストの実行は逐次で同時に 2 本走らないため、最も新しい
 * cases.tsv を持つディレクトリで一意に決まる。
 *
 * export:
 *   ACTIONS
 *   resolveArtifactDir(cwd)                → 成果物ディレクトリ | null
 *   decide({ state, checkCode, advanced, inFlight }) → { action, reason }
 *   renderBlock(progress, reason)          → ブロック時に返す文面
 *   renderStop(progress, reason)           → 停止時に返す文面
 *   mostRecentAttempt(cases)               → 台帳の中で最も新しく更新された行の要約 | null
 *   buildStopReport({ reason, progress, phase, cases, now }) → stop-report.json の中身
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAX_CONSECUTIVE_BLOCKS, NO_PROGRESS_MAX_TURNS } from "./constants.mjs";
import { TESTING_ROOT } from "./paths.mjs";

export const ACTIONS = ["allow", "defer", "block", "stop"];

export function resolveArtifactDir(cwd) {
  const root = join(cwd, TESTING_ROOT);
  if (!existsSync(root)) return null;

  let best = null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const cases = join(dir, "cases.tsv");
    if (!existsSync(cases)) continue;
    const mtime = statSync(cases).mtimeMs;
    if (best === null || mtime > best.mtime) best = { dir, mtime };
  }

  return best?.dir ?? null;
}

export const DELIVERED_MARKER_NAME = "delivered.json";

export function isDelivered(artifactDir) {
  return existsSync(join(artifactDir, DELIVERED_MARKER_NAME));
}

export function decide({ state, checkCode, advanced = 0, inFlight = 0, delivered = true }) {
  if (!state) return { action: "allow", reason: "ゲートが装填されていない" };

  // 移譲が成立している間は「終了」ではなく「待機」である。ここでブロックしても
  // 待つための埋め草を書かせるだけで、台帳は進まない。
  if (inFlight > 0) return { action: "defer", reason: "バックグラウンド作業を待っている" };

  if (checkCode === 0) {
    if (state.phase === "execution" && !delivered) {
      return { action: "block", reason: "台帳は完了しているが、まだ納品(Phase 6)が完了していない" };
    }
    return { action: "allow", reason: "完了している" };
  }

  if (checkCode !== 1) {
    return { action: "stop", reason: "台帳を検査できなかった。台帳が壊れている可能性がある" };
  }

  const noProgressTurns = advanced > 0 ? 0 : state.noProgressTurns + 1;
  if (noProgressTurns >= NO_PROGRESS_MAX_TURNS) {
    return { action: "stop", reason: `前進が ${noProgressTurns} ターン無い` };
  }

  const consecutiveBlocks = state.consecutiveBlocks + 1;
  if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    return { action: "stop", reason: `連続ブロックが ${consecutiveBlocks} 回に達した` };
  }

  return { action: "block", reason: "残件がある" };
}

function summaryLine(progress) {
  return (
    `${progress.total} 件中 todo ${progress.todo} 件 ` +
    `(pass ${progress.pass} / fail ${progress.fail} / error ${progress.error} / ` +
    `out_of_scope ${progress.out_of_scope})`
  );
}

export function renderBlock(progress, reason) {
  return [
    "テストが完走していないため終了できない。",
    summaryLine(progress),
    ...(progress.reasons ?? []).map((r) => `- ${r}`),
    "",
    reason,
    "残っているケースの消化を続けること。",
  ].join("\n");
}

export function renderStop(progress, reason) {
  return [
    "テストが完走できなかった。ゲートを降りる。",
    "",
    `理由: ${reason}`,
    summaryLine(progress),
    ...(progress.reasons ?? []).map((r) => `- ${r}`),
    "",
    "何が詰まったかを stop-report.json に残した。",
    "残件があるまま終わっている。完了として扱わないこと。",
  ].join("\n");
}

export function mostRecentAttempt(cases) {
  const withUpdate = cases.filter((c) => c.updated_at);
  if (withUpdate.length === 0) return null;
  const latest = withUpdate.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
  return {
    case_id: latest.case_id,
    status: latest.status,
    attempts: latest.attempts,
    evidence_path: latest.evidence_path,
    updated_at: latest.updated_at,
  };
}

export function buildStopReport({ reason, progress, phase, cases = [], now = new Date().toISOString() }) {
  return {
    stopped_at: now,
    phase,
    reason,
    progress,
    most_recent_attempt: mostRecentAttempt(cases),
  };
}
