/**
 * completion-state.mjs
 *
 * 完走ゲートのカウンタをセッション単位で持つ。
 *
 * 数えるのは 2 つ。連続でブロックした回数と、前進が 0 だったターンが続いた回数。
 * どちらもゲートが自分から降りる判断に使う。
 *
 * ターン終了フックは 8 回連続でブロックすると Claude Code 側に上書きされてターンが
 * 終わる。上書きされると「残件があるのに正常終了した」ように見え、無人実行では
 * それに気づけない。だから 8 に届く前に自分から止まる。そのために回数を覚えておく
 * 必要がある。
 *
 * セッション単位にするのは、リポジトリ単位の共有状態にすると並行して動く他の
 * エージェントのターンまで数えてしまうからである。session_id は他エージェントから
 * 観測も変更もできない。
 *
 * フェーズは装填時のスキル名から決まる。生成と実施では完了条件が違い、実施フェーズで
 * 要件の被覆を見ると永久にブロックされる。
 *
 * export:
 *   COMPLETION_DIR_NAME / PHASE_BY_SKILL
 *   completionPath(sessionId, root)
 *   readCompletion(sessionId, opts)  → state | null
 *   armCompletion(sessionId, opts)   → state
 *   recordTurn(sessionId, opts)      → state | null
 *   disarmCompletion(sessionId, opts)
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const COMPLETION_DIR_NAME = "kiai-sp-testing-completion";

/** どのスキルを起動したらどのフェーズとして検査するか */
export const PHASE_BY_SKILL = {
  "generating-spec-tests": "generation",
  "executing-spec-tests": "execution",
};

export function completionPath(sessionId, root = tmpdir()) {
  return join(root, COMPLETION_DIR_NAME, `${sessionId}.json`);
}

function write(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), "utf8");
  renameSync(tmp, path);
}

export function readCompletion(sessionId, { root = tmpdir() } = {}) {
  if (!sessionId) return null;
  const path = completionPath(sessionId, root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed?.armedAt !== "string" || typeof parsed?.phase !== "string") return null;
    return {
      armedAt: parsed.armedAt,
      phase: parsed.phase,
      consecutiveBlocks: Number.isInteger(parsed.consecutiveBlocks) ? parsed.consecutiveBlocks : 0,
      noProgressTurns: Number.isInteger(parsed.noProgressTurns) ? parsed.noProgressTurns : 0,
    };
  } catch {
    return null;
  }
}

export function armCompletion(
  sessionId,
  { phase, now = new Date().toISOString(), root = tmpdir() } = {},
) {
  const existing = readCompletion(sessionId, { root });
  const state = {
    armedAt: existing?.armedAt ?? now,
    phase,
    consecutiveBlocks: existing?.consecutiveBlocks ?? 0,
    noProgressTurns: existing?.noProgressTurns ?? 0,
  };
  write(completionPath(sessionId, root), state);
  return state;
}

export function recordTurn(sessionId, { blocked, advanced = 0, root = tmpdir() } = {}) {
  const existing = readCompletion(sessionId, { root });
  if (!existing) return null;

  const state = blocked
    ? {
        ...existing,
        consecutiveBlocks: existing.consecutiveBlocks + 1,
        noProgressTurns: advanced > 0 ? 0 : existing.noProgressTurns + 1,
      }
    : { ...existing, consecutiveBlocks: 0, noProgressTurns: 0 };

  write(completionPath(sessionId, root), state);
  return state;
}

export function disarmCompletion(sessionId, { root = tmpdir() } = {}) {
  rmSync(completionPath(sessionId, root), { force: true });
}
