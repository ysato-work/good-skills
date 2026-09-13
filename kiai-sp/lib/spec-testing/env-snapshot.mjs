/**
 * env-snapshot.mjs
 *
 * テストの前後でコンテナ・ボリューム・ネットワークの一覧を取り、突き合わせる。
 *
 * 見るのは 2 つ。自分が立てたもの（接頭辞つきの名前）が残っていないこと。開発者の
 * 資源（接頭辞なしの名前）が増えても減ってもいないこと。前者は後始末の確認で、
 * 後者は汚染の確認である。
 *
 * ポートは見ない。固定ホストポートの割り当て自体をガードが禁じているので、実行前後の
 * ポート一覧を突き合わせる必要がない。
 *
 * docker が無い環境では比較せず ok を返す。ここで落とすと、コンテナを使わない
 * プロジェクトでテストが走らなくなる。ただし理由には必ずその旨を残し、確認を
 * したように見えないようにする。
 *
 * export:
 *   parseNames(text)
 *   collectEnv({ spawn }) → { available, containers, volumes, networks }
 *   verifyNoLeftovers(before, after, { prefix })
 *     → { ok, leaked, foreignAdded, foreignRemoved, reason }
 */
import { spawnSync } from "node:child_process";
import { RESOURCE_PREFIX } from "./forbidden-bash.mjs";

export function parseNames(text) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function collectEnv({ spawn = spawnSync } = {}) {
  const run = (args) => spawn("docker", args, { encoding: "utf8" });

  const ps = run(["ps", "-a", "--format", "{{.Names}}"]);
  if ((ps.status ?? 1) !== 0) {
    return { available: false, containers: [], volumes: [], networks: [] };
  }

  return {
    available: true,
    containers: parseNames(ps.stdout ?? ""),
    volumes: parseNames(run(["volume", "ls", "--format", "{{.Name}}"]).stdout ?? ""),
    networks: parseNames(run(["network", "ls", "--format", "{{.Name}}"]).stdout ?? ""),
  };
}

const KINDS = ["containers", "volumes", "networks"];

export function verifyNoLeftovers(before, after, { prefix = RESOURCE_PREFIX } = {}) {
  if (before?.available === false || after?.available === false) {
    return {
      ok: true,
      leaked: [],
      foreignAdded: [],
      foreignRemoved: [],
      reason: "docker が使えないため後始末を確認していない",
    };
  }

  const leaked = [];
  const foreignAdded = [];
  const foreignRemoved = [];

  for (const kind of KINDS) {
    const beforeSet = new Set(before?.[kind] ?? []);
    const afterSet = new Set(after?.[kind] ?? []);

    for (const name of afterSet) {
      if (beforeSet.has(name)) continue;
      if (name.startsWith(prefix)) leaked.push(`${kind}:${name}`);
      else foreignAdded.push(`${kind}:${name}`);
    }
    for (const name of beforeSet) {
      if (!afterSet.has(name) && !name.startsWith(prefix)) foreignRemoved.push(`${kind}:${name}`);
    }
  }

  const reasons = [];
  if (leaked.length > 0) reasons.push(`立てた環境が残っている: ${leaked.join(", ")}`);
  if (foreignAdded.length > 0) reasons.push(`開発者の資源が増えている: ${foreignAdded.join(", ")}`);
  if (foreignRemoved.length > 0) reasons.push(`開発者の資源が消えている: ${foreignRemoved.join(", ")}`);

  return {
    ok: reasons.length === 0,
    leaked,
    foreignAdded,
    foreignRemoved,
    reason: reasons.length === 0 ? "実行前後で環境は変わっていない" : reasons.join(" / "),
  };
}
