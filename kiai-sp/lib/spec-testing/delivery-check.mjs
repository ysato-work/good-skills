/**
 * delivery-check.mjs
 *
 * 成果物ディレクトリに置いてよいファイルかを判定する。
 *
 * 禁じられているのは**ワンショットのスクリプト**であって、テストで使ったファイル
 * 一般ではない。入力データや期待値ファイルも証跡の一部で、納品対象である。拡張子
 * だけの許可リストで絞ると、スクリーンショットや入力データまで弾いてしまう。
 *
 * そこで**場所ごとに許可するもの**を決め、あわせて**実行可能なものを明示的に禁じる**。
 * 二重にかけるのは、片方だけだと想定外のファイルを見逃すか、必要なファイルを弾くかの
 * どちらかになるためである。
 *
 * 書き込みの一時ファイルが残っていたら弾く。台帳の書き込みは別名で書いてから rename
 * するので、正常時は存在しない。残っているのは書き込みが途中で切れた証拠であり、
 * その台帳は信用できない。commit する前に気づく必要がある。
 *
 * 問題は 1 件目で止めず全部返す。無人実行では、直しては止まりを繰り返すのが一番
 * 時間を食う。
 *
 * export:
 *   ROOT_ALLOWED / EVIDENCE_ALLOWED_EXT / SCRIPT_EXTENSIONS
 *   checkFile(relPath, { mode })  → { ok, reason }
 *   checkArtifacts(artifactDir)   → { ok, problems, fileCount }
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, posix } from "node:path";

/** 成果物ディレクトリ直下に置いてよいファイル名 */
export const ROOT_ALLOWED = [
  "cases.tsv",
  "requirements.tsv",
  "progress.json",
  "progress.prev.json",
  "report.md",
  "stop-report.json",
  "delivered.json",
];

/** 証跡ディレクトリに置いてよい拡張子。fixtures 配下はこの制限を受けない */
export const EVIDENCE_ALLOWED_EXT = [".md", ".log", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

/** スクリプトとして解釈される拡張子。どこにあっても納品しない */
export const SCRIPT_EXTENSIONS = [
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".mjs",
  ".cjs",
  ".js",
  ".ts",
  ".py",
  ".rb",
  ".pl",
  ".ps1",
  ".bat",
  ".cmd",
  ".exe",
  ".dll",
  ".msi",
  ".com",
  ".scr",
  ".vbs",
  ".wsf",
  ".php",
  ".php3",
  ".php4",
  ".php5",
  ".phtml",
  ".jar",
  ".class",
  ".apk",
];

export function checkFile(relPath, { mode = 0o100644 } = {}) {
  const parts = relPath.split(posix.sep);
  const name = parts[parts.length - 1];
  const ext = extname(name).toLowerCase();

  if ((mode & 0o111) !== 0) {
    return { ok: false, reason: "実行権限がついている" };
  }
  if (SCRIPT_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `スクリプトとして解釈される拡張子 (${ext})` };
  }
  if (name.startsWith(".") && name.endsWith(".tmp")) {
    return { ok: false, reason: "書き込みの一時ファイルが残っている。消してから納品する" };
  }

  if (parts.length === 1) {
    return ROOT_ALLOWED.includes(name)
      ? { ok: true }
      : { ok: false, reason: `直下に置いてよいファイルの一覧に無い (${ROOT_ALLOWED.join(", ")})` };
  }

  if (parts[0] !== "evidence") {
    return { ok: false, reason: `evidence 以外のディレクトリには置けない (${parts[0]}/)` };
  }
  if (parts.length === 2) {
    return { ok: false, reason: "証跡はケースごとのディレクトリに置く" };
  }

  const rest = parts.slice(2);
  if (rest[0] === "fixtures") return { ok: true };
  if (rest.length > 1) {
    return { ok: false, reason: `証跡のサブディレクトリは fixtures だけ (${rest[0]}/)` };
  }

  return EVIDENCE_ALLOWED_EXT.includes(ext)
    ? { ok: true }
    : { ok: false, reason: `証跡に置いてよい拡張子ではない (${ext || "拡張子なし"})` };
}

function walk(root, prefix = "") {
  const found = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : posix.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...walk(root, rel));
    else found.push(rel);
  }
  return found;
}

export function checkArtifacts(artifactDir) {
  if (!existsSync(artifactDir)) {
    return { ok: false, problems: [{ path: artifactDir, reason: "成果物ディレクトリが無い" }], fileCount: 0 };
  }

  const files = walk(artifactDir);
  const problems = [];

  for (const rel of files) {
    const verdict = checkFile(rel, { mode: statSync(join(artifactDir, rel)).mode });
    if (!verdict.ok) problems.push({ path: rel, reason: verdict.reason });
  }

  return { ok: problems.length === 0, problems, fileCount: files.length };
}
