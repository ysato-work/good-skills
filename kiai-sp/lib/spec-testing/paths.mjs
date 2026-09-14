/**
 * paths.mjs
 *
 * 成果物の置き場を 1 箇所で決める。
 *
 * 成果物は検証対象リポジトリの docs/superpowers/testing/<spec 名ベース>/ に置く。
 * ディレクトリ名を spec のファイル名から機械的に導くことで、どの spec に対する
 * 検証だったかが名前から辿れる。パスの組み立てを各スキルに書かせると綴りが揺れて
 * 別ディレクトリに散るので、ここに閉じ込める。
 *
 * ログのファイル名は ASCII に落とす。日本語のコマンド説明をそのままファイル名に
 * すると環境によって扱いが変わるため。落ちた情報は commands.md 側に原文で残る。
 *
 * export:
 *   TESTING_ROOT                    → docs/superpowers/testing
 *   specSlug(specPath)              → spec 名ベース
 *   artifactDir(repoRoot, specPath) → 成果物ディレクトリ
 *   casesPath / requirementsPath / progressPath / progressPrevPath / reportPath
 *   evidenceDir / commandsPath / fixturesDir
 *   slugify(text) / logFileName(index, text)
 */
import { basename, join } from "node:path";

export const TESTING_ROOT = join("docs", "superpowers", "testing");

export function specSlug(specPath) {
  return basename(String(specPath))
    .replace(/\.md$/, "")
    .replace(/-design$/, "");
}

export function artifactDir(repoRoot, specPath) {
  return join(repoRoot, TESTING_ROOT, specSlug(specPath));
}

export function casesPath(dir) {
  return join(dir, "cases.tsv");
}

export function requirementsPath(dir) {
  return join(dir, "requirements.tsv");
}

export function progressPath(dir) {
  return join(dir, "progress.json");
}

export function progressPrevPath(dir) {
  return join(dir, "progress.prev.json");
}

export function reportPath(dir) {
  return join(dir, "report.md");
}

export function evidenceDir(dir, caseId) {
  return join(dir, "evidence", caseId);
}

export function commandsPath(dir, caseId) {
  return join(evidenceDir(dir, caseId), "commands.md");
}

export function fixturesDir(dir, caseId) {
  return join(evidenceDir(dir, caseId), "fixtures");
}

export function slugify(text) {
  const s = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s === "" ? "cmd" : s;
}

export function logFileName(index, text) {
  return `${index}-${slugify(text)}.log`;
}
