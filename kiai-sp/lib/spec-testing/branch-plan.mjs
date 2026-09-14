/**
 * branch-plan.mjs
 *
 * 成果物をどのブランチに、どの remote へ出すかを決める。
 *
 * base は**検証開始時点のブランチ**である。main ではない。検証対象が開発中の
 * ブランチである以上、成果物の行き先もその開発ブランチになる。人間に base を
 * 尋ねない。尋ねた時点で人間非介在での完走が壊れる。
 *
 * 投稿先は検証対象のブランチが追跡している remote から決める。スキル側の
 * リポジトリではない。リポジトリ名もホスト名もここに書かない。任意のリポジトリを
 * 検証対象にできる必要がある。
 *
 * 成果物ブランチの接頭辞はガードが push を通す条件そのものなので、文字列を書かず
 * ガード側の定数から取る。ずれると push が必ず止まる。
 *
 * 手順は 6 つで固定してある。分岐も人間への問いかけも無い。
 *
 * export:
 *   DELIVERY_STEPS
 *   stamp(now) / artifactBranchName(specSlug, opts)
 *   collectGit({ cwd, spawn }) → { branch, remote }
 *   planDelivery({ baseBranch, remote, specSlug, now }) → 納品計画
 */
import { spawnSync } from "node:child_process";
import { ALLOWED_BRANCH_PREFIX } from "./forbidden-bash.mjs";

/** 納品の固定手順。増やさない。分岐させない */
export const DELIVERY_STEPS = [
  "検証開始時点のブランチから成果物ブランチを切る",
  "テストアーティファクトをコミットする",
  "テストコードをコミットする",
  "環境定義をコミットする",
  "成果物ブランチを remote に push する",
  "base を検証開始時点のブランチにして PR を作成する",
];

export function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
  );
}

export function artifactBranchName(specSlug, { now = new Date() } = {}) {
  const safe =
    String(specSlug)
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "spec";
  return `${ALLOWED_BRANCH_PREFIX}${safe}-${stamp(now)}`;
}

export function collectGit({ cwd = process.cwd(), spawn = spawnSync } = {}) {
  const run = (args) => spawn("git", args, { cwd, encoding: "utf8" });
  const text = (result) => ((result?.status ?? 1) === 0 ? String(result.stdout ?? "").trim() : "");

  const branch = text(run(["rev-parse", "--abbrev-ref", "HEAD"]));
  if (branch === "") return { branch: "", remote: "" };

  const tracked = text(run(["config", "--get", `branch.${branch}.remote`]));
  if (tracked !== "") return { branch, remote: tracked };

  // 追跡先が無いときは、remote が 1 つだけならそれで一意に決まる。
  // 複数あるなら推測しない。空で返して呼び出し側を止める。
  const remotes = text(run(["remote"]))
    .split("\n")
    .filter((r) => r !== "");
  return { branch, remote: remotes.length === 1 ? remotes[0] : "" };
}

export function planDelivery({ baseBranch, remote, specSlug, now = new Date() }) {
  if (!baseBranch) {
    throw new Error("検証開始時点のブランチが分からない。納品先のブランチを決められない");
  }
  if (!remote) {
    throw new Error("投稿先の remote が一意に決まらない。追跡先を設定するか remote を 1 つにする");
  }

  return {
    baseBranch,
    remote,
    branch: artifactBranchName(specSlug, { now }),
    prBase: baseBranch,
    steps: DELIVERY_STEPS,
  };
}
