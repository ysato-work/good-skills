/**
 * review-record.mjs
 *
 * spec / plan のセルフレビュー記録を書き、検証する。
 *
 * 記録は対象ファイル内容の SHA-256 を持つ。レビュー後に対象を編集すると
 * ハッシュが一致しなくなり、記録は自動的に無効になる。
 *
 * 期待する観点セットはスキル名ではなく対象ファイルの置き場所で決める。
 * 1 セッションで両スキルが動いてもファイルごとに一意に決まる。
 *
 * export:
 *   sha256(text)                        → 16 進ダイジェスト
 *   recordPath(targetPath)               → 記録ファイルのパス
 *   isPlan(targetPath)                   → plans 配下か
 *   isReviewTarget(targetPath)           → specs / plans 直下の .md か
 *   expectedChecks(targetPath)           → 期待する観点名の配列
 *   requiresReviewer(targetPath)         → reviewer が必須か
 *   writeRecord(targetPath, opts)        → 書き出した記録
 *   validateRecord(targetPath)           → { ok, reason } の検証結果
 *   verifyAll(targets, opts)             → { ok, failures } の一括検証結果
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const SPEC_CHECKS = [
  "Placeholder scan",
  "Internal consistency",
  "Scope check",
  "Ambiguity check",
  "Traceability check",
];

export const PLAN_CHECKS = [
  "Spec coverage",
  "Placeholder scan",
  "Type consistency",
  "Traceability check",
];

export const DOCS_DIR = "docs/superpowers";
export const SPEC_DIR = `${DOCS_DIR}/specs`;
export const PLAN_DIR = `${DOCS_DIR}/plans`;

// レビュー記録は追跡対象の成果物ではなくスクラッチなので、本家 superpowers が
// SDD の作業ファイルや brainstorm のセッション state に使う `.superpowers/` に
// 置く。docs/ 配下に sidecar を置くと対象リポジトリの git status を汚し、
// リポジトリごとに .gitignore を整備しないと commit に混入する。
export const RECORD_DIR = ".superpowers/review-records";

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function toPosix(p) {
  return p.split("\\").join("/");
}

// 対象パスを「リポジトリルート」と「docs/superpowers/ 以降の相対パス」に割る。
// ルートは git に問い合わせず対象パス自体から決めるので、worktree でも
// git が無い環境でも同じ結果になる。
function splitTarget(targetPath) {
  const posix = toPosix(targetPath);
  const marker = `/${DOCS_DIR}/`;
  const at = posix.lastIndexOf(marker);
  if (at < 0) {
    throw new Error(`レビュー記録の置き場所を決められない（${DOCS_DIR}/ 配下でない）: ${targetPath}`);
  }

  const rel = posix.slice(at + marker.length);
  // `docs/superpowers/specs/../../x.md` のようなパスを弾く。marker は
  // lastIndexOf で探すので、これを許すと記録が RECORD_DIR の外、すなわち
  // ignore されない場所に出てしまう。`a..b-design.md` のように名前の一部に
  // `..` を含むだけのものは通す。
  if (rel.split("/").includes("..")) {
    throw new Error(`レビュー記録の置き場所を決められない（パス要素に ".." を含む）: ${targetPath}`);
  }

  return { root: posix.slice(0, at), rel };
}

export function recordRoot(targetPath) {
  return `${splitTarget(targetPath).root}/${RECORD_DIR}`;
}

// specs/ plans/ の階層を保つので、両者に同名ファイルがあっても衝突しない。
export function recordPath(targetPath) {
  const { root, rel } = splitTarget(targetPath);
  return `${root}/${RECORD_DIR}/${rel.replace(/\.md$/, ".review.json")}`;
}

export function isPlan(targetPath) {
  return targetPath.split("\\").join("/").includes(PLAN_DIR);
}

// PostToolUse フックが「この書き込みを台帳に載せるか」を判断するための述語。
// specs / plans の直下にある .md だけを対象にする。サブディレクトリ配下を
// 除くのは、recordPath がその階層を保って記録を書くため、対象を直下に
// 揃えておかないと記録の置き場所が読みにくくなるからである。
export function isReviewTarget(targetPath) {
  const posix = toPosix(targetPath);
  for (const dir of [SPEC_DIR, PLAN_DIR]) {
    const marker = `/${dir}/`;
    const at = posix.lastIndexOf(marker);
    if (at < 0) continue;
    const rest = posix.slice(at + marker.length);
    if (rest.endsWith(".md") && !rest.includes("/")) return true;
  }
  return false;
}

export function expectedChecks(targetPath) {
  return isPlan(targetPath) ? PLAN_CHECKS : SPEC_CHECKS;
}

export function requiresReviewer(targetPath) {
  return isReviewTarget(targetPath);
}

export function writeRecord(
  targetPath,
  { skill, checks, reviewer = null, now = new Date().toISOString() },
) {
  const record = {
    target: basename(targetPath),
    targetSha256: sha256(readFileSync(targetPath, "utf8")),
    skill,
    reviewedAt: now,
    checks,
  };
  if (reviewer) record.reviewer = reviewer;

  const rp = recordPath(targetPath);
  mkdirSync(dirname(rp), { recursive: true });
  // 自己 ignore。対象リポジトリの .gitignore（追跡ファイル）に手を入れずに
  // 記録を git status と commit から外す。本家の sdd-workspace と同じ方式。
  writeFileSync(join(recordRoot(targetPath), ".gitignore"), "*\n");
  writeFileSync(rp, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function validateRecord(targetPath) {
  const rp = recordPath(targetPath);
  if (!existsSync(rp)) return { ok: false, reason: "レビュー記録が無い" };

  let record;
  try {
    record = JSON.parse(readFileSync(rp, "utf8"));
  } catch {
    return { ok: false, reason: "レビュー記録が JSON として読めない" };
  }

  if (record.targetSha256 !== sha256(readFileSync(targetPath, "utf8"))) {
    return { ok: false, reason: "レビュー後に対象ファイルが編集されている" };
  }

  const items = Array.isArray(record.checks) ? record.checks.map((c) => c.item) : [];
  const missing = expectedChecks(targetPath).filter((i) => !items.includes(i));
  if (missing.length > 0) {
    return { ok: false, reason: `セルフレビューの観点が不足: ${missing.join(", ")}` };
  }

  if (
    requiresReviewer(targetPath) &&
    String(record.reviewer?.status ?? "").toLowerCase() !== "approved"
  ) {
    const kind = isPlan(targetPath) ? "plan" : "spec";
    return { ok: false, reason: `${kind} reviewer が approved を返していない` };
  }

  return { ok: true, reason: null };
}

/**
 * 渡された対象だけを検証する。
 *
 * ディレクトリを走査しないのが要点。走査すると他エージェントが同じ
 * リポジトリに置いた spec / plan まで拾ってしまう。対象の決定は
 * セッション台帳（gate-state.mjs の writes）に委ねる。
 *
 * 実在しない対象は skip する。台帳に載った後で削除・rename された場合で、
 * rename なら新しいパスが改めて台帳に載る。
 */
export function verifyAll(targets, { plansOnly = false } = {}) {
  const failures = [];
  for (const target of targets ?? []) {
    if (plansOnly && !isPlan(target)) continue;
    if (!existsSync(target)) continue;

    const r = validateRecord(target);
    if (!r.ok) failures.push({ target, reason: r.reason });
  }
  return { ok: failures.length === 0, failures };
}

function parseArgs(argv) {
  const checks = [];
  const issues = [];
  let skill = "";
  let reviewerStatus = "";

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--skill") {
      skill = value;
      i += 1;
    } else if (flag === "--check") {
      const sep = value.indexOf("=");
      if (sep < 0) throw new Error(`--check は "<item>=<finding>" 形式で渡す: ${value}`);
      checks.push({ item: value.slice(0, sep), finding: value.slice(sep + 1) });
      i += 1;
    } else if (flag === "--reviewer-status") {
      reviewerStatus = value;
      i += 1;
    } else if (flag === "--reviewer-issue") {
      issues.push(value);
      i += 1;
    }
  }

  return { skill, checks, reviewerStatus, issues };
}

if (process.argv[1]?.endsWith("review-record.mjs")) {
  const [command, target, ...rest] = process.argv.slice(2);
  if (command !== "write") {
    process.stderr.write('使い方: node review-record.mjs write <target> --skill <name> --check "<item>=<finding>"\n');
    process.exit(1);
  }

  const { skill, checks, reviewerStatus, issues } = parseArgs(rest);
  const reviewer = reviewerStatus ? { status: reviewerStatus, issues } : null;
  writeRecord(target, { skill, checks, reviewer });

  const result = validateRecord(target);
  process.stdout.write(`${result.ok ? "OK" : `NG: ${result.reason}`}\n`);
  process.exit(result.ok ? 0 : 1);
}
