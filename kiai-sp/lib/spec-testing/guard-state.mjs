/**
 * guard-state.mjs
 *
 * テストガードの装填状態をセッション単位で持つ。
 *
 * ガードはテストスキルを起動したセッションでだけ効く。装填が無ければ何も止めない。
 * リポジトリ単位の共有状態にすると、並行して動く他のエージェントや、同じマシンで
 * 普通に開発している人の操作まで止めてしまう。session_id は他エージェントから
 * 観測も変更もできない鍵なので、これをキーにすれば何体並走しても混ざらない。
 *
 * 持つのは装填時刻だけである。「どのブランチへの push を許すか」のような許可対象を
 * ここに記録しない。記録が落ちた瞬間に「何でも許す」か「何も許さない」のどちらかに
 * 倒れるからで、許可の判定材料はコマンドの中の名前だけで完結させてある。
 *
 * export:
 *   GUARD_DIR_NAME
 *   guardPath(sessionId, root)   → state ファイルの絶対パス
 *   readGuard(sessionId, opts)   → { armedAt } | null
 *   armGuard(sessionId, opts)    → { armedAt }
 *   disarmGuard(sessionId, opts) → void
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const GUARD_DIR_NAME = "kiai-sp-testing-guard";

export function guardPath(sessionId, root = tmpdir()) {
  return join(root, GUARD_DIR_NAME, `${sessionId}.json`);
}

export function readGuard(sessionId, { root = tmpdir() } = {}) {
  if (!sessionId) return null;
  const path = guardPath(sessionId, root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed?.armedAt !== "string") return null;
    return { armedAt: parsed.armedAt };
  } catch {
    return null;
  }
}

export function armGuard(sessionId, { now = new Date().toISOString(), root = tmpdir() } = {}) {
  const existing = readGuard(sessionId, { root });
  const state = { armedAt: existing?.armedAt ?? now };

  const path = guardPath(sessionId, root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), "utf8");
  renameSync(tmp, path);

  return state;
}

export function disarmGuard(sessionId, { root = tmpdir() } = {}) {
  rmSync(guardPath(sessionId, root), { force: true });
}
