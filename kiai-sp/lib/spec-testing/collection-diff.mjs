/**
 * collection-diff.mjs
 *
 * 結合テストや E2E を書き足したあとで、既存の単体テスト実行コマンドがそれらを
 * 拾っていないことを、実際にコマンドを走らせて確認する。
 *
 * 指示文で「命名規則を分ける」と書くだけでは足りない。無人で書き足す以上、実際に
 * 収集対象が増えていないことをコマンドの出力で確かめる必要がある。単体テストは
 * 速いことを前提に運用されており、時間のかかるテストが紛れ込むと開発者の日常が
 * 遅くなり、CI も壊れる。
 *
 * 一覧が取れないランナーのために、件数での比較にフォールバックする。どちらも
 * 取れなければ ok を返さない。「比較できなかった」を成功にすると、この確認が
 * 黙って無効になる。
 *
 * spawnSync は注入できるようにしてある。テストから本物のテストランナーを起こさない
 * ためである。
 *
 * export:
 *   parseCollected(text) / countFromSummary(text) / snapshot(text)
 *   verifyNoNewCollection(before, after) → { ok, added, removed, reason }
 *   runCollect(command, { cwd, spawn }) → { code, stdout, stderr }
 */
import { spawnSync } from "node:child_process";

const PATH_LIKE = /^[\w./@+-]+\.[a-z0-9]+$/i;

export function parseCollected(text) {
  const found = new Set();

  for (const line of String(text).split("\n")) {
    const token = line.trim().split(/\s+/)[0] ?? "";
    const path = token.split("::")[0].replace(/:\d+(?::\d+)?$/, "");
    if (path !== "" && PATH_LIKE.test(path)) found.add(path);
  }

  return [...found].sort();
}

export function countFromSummary(text) {
  const s = String(text);

  // "Tests: 7 passed, 7 total" のような要約行を最優先で読む。
  // スイート数の行が先に出るランナーがあるため、テスト件数の行を名指しする。
  const testsLine = s.match(/\btests?\s*:\s*[^\n]*?(\d+)\s+total\b/i);
  if (testsLine) return Number(testsLine[1]);

  const direct = s.match(/(\d+)\s+(?:tests?|items?|examples?)\b/i);
  if (direct) return Number(direct[1]);

  const total = s.match(/(\d+)\s+total\b/i);
  return total ? Number(total[1]) : null;
}

export function snapshot(text) {
  return { files: parseCollected(text), count: countFromSummary(text) };
}

export function verifyNoNewCollection(before, after) {
  const beforeFiles = new Set(before.files ?? []);
  const afterFiles = new Set(after.files ?? []);

  if (beforeFiles.size > 0 || afterFiles.size > 0) {
    const added = [...afterFiles].filter((f) => !beforeFiles.has(f)).sort();
    const removed = [...beforeFiles].filter((f) => !afterFiles.has(f)).sort();

    if (added.length > 0) {
      return { ok: false, added, removed, reason: `単体テストの収集対象が増えている: ${added.join(", ")}` };
    }
    if (removed.length > 0) {
      return { ok: false, added, removed, reason: `単体テストの収集対象が減っている: ${removed.join(", ")}` };
    }
    return { ok: true, added: [], removed: [], reason: "収集対象は変わっていない" };
  }

  if (Number.isInteger(before.count) && Number.isInteger(after.count)) {
    if (after.count !== before.count) {
      return {
        ok: false,
        added: [],
        removed: [],
        reason: `単体テストの件数が ${before.count} から ${after.count} に増えている`,
      };
    }
    return { ok: true, added: [], removed: [], reason: `件数は ${before.count} のまま変わっていない` };
  }

  return {
    ok: false,
    added: [],
    removed: [],
    reason: "収集対象を比較できなかった。一覧も件数も読めていない",
  };
}

export function runCollect(command, { cwd = process.cwd(), spawn = spawnSync } = {}) {
  const result = spawn("bash", ["-lc", command], { cwd, encoding: "utf8" });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
