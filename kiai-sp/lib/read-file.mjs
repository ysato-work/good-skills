// テスト間で共有する読み込みの下ごしらえ。skills/ の下のスキル定義を読む。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

export function readFile(rel) {
  return readFileSync(join(SKILLS_DIR, rel), "utf8");
}
