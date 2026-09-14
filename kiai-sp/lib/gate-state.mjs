/**
 * gate-state.mjs
 *
 * セルフレビューゲートのセッション state を読み書きする。
 *
 * armedAt は最初の装填時刻。検証には使わず、いつ装填されたかを追うためだけに
 * 持つ。2 回目以降の装填で上書きしないのは、この値を「一連の作業の開始時刻」
 * として読めるようにしておくため。
 *
 * writes は「このセッションが Write / Edit した spec / plan の絶対パス」の台帳。
 * Stop ゲートはこの配列だけを検証する。mtime や git の状態はリポジトリ単位の
 * 共有状態でセッションに紐づかないため、並行する他エージェントの成果物が
 * 混入する。session_id は他エージェントから観測も変更もできない鍵なので、
 * これをキーにした台帳なら何体並走しても混ざらない。
 *
 * export:
 *   statePath(sessionId, root)         → state ファイルの絶対パス
 *   readState(sessionId, opts)         → state | null
 *   arm(sessionId, skill, opts)        → 更新後の state
 *   recordWrite(sessionId, path, opts) → 更新後の state（未装填なら null）
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const STATE_DIR_NAME = "kiai-sp-gate";

export function statePath(sessionId, root = tmpdir()) {
  return join(root, STATE_DIR_NAME, `${sessionId}.json`);
}

export function readState(sessionId, { root = tmpdir() } = {}) {
  const p = statePath(sessionId, root);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    if (typeof parsed?.armedAt !== "string" || !Array.isArray(parsed?.skills)) return null;
    // writes を持たない旧形式の state を空の台帳として読む。
    return {
      armedAt: parsed.armedAt,
      skills: parsed.skills,
      writes: Array.isArray(parsed.writes) ? parsed.writes : [],
    };
  } catch {
    return null;
  }
}

// 同一ディレクトリへ一時ファイルを書いてから rename することで、
// 読み手が truncate 直後の不完全な JSON を掴む窓を無くす（読み手は
// 常に「更新前の完全なファイル」か「更新後の完全なファイル」のどちらかを見る）。
function persist(sessionId, state, root) {
  const p = statePath(sessionId, root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, p);
  return state;
}

export function arm(sessionId, skill, { now = new Date().toISOString(), root = tmpdir() } = {}) {
  const prev = readState(sessionId, { root });
  const state = prev
    ? {
        armedAt: prev.armedAt,
        skills: prev.skills.includes(skill) ? prev.skills : [...prev.skills, skill],
        writes: prev.writes,
      }
    : { armedAt: now, skills: [skill], writes: [] };

  return persist(sessionId, state, root);
}

// 装填されていないセッションでは何も記録しない。ゲートが装填されていない
// 間の書き込みは検証対象ではないため。
export function recordWrite(sessionId, absPath, { root = tmpdir() } = {}) {
  const prev = readState(sessionId, { root });
  if (!prev) return null;
  if (prev.writes.includes(absPath)) return prev;

  return persist(sessionId, { ...prev, writes: [...prev.writes, absPath].sort() }, root);
}
