/**
 * result-memo.mjs
 *
 * 実行係が書き、反映係が読む中間ファイルの読み書きと検証。
 *
 * 置き場は成果物ディレクトリの外にする。S1 のデータ契約 (ROOT_ALLOWED / EVIDENCE_ALLOWED_EXT)
 * に触れずに済ませるため。環境スナップショットが既に同じ場所に置かれている前例がある。
 *
 * スキーマは result-memo-schema.json を持つ。JSON Schema のうち type / enum / pattern /
 * required / minimum / additionalProperties だけを解釈する。ネットワークに出て
 * ajv を取りに行けないサンドボックスでも動くように、対応外のキーワードは throw する。
 *
 * export:
 *   resultsDir(artifactDir) / memoPath(artifactDir, caseId)
 *   writeMemo(artifactDir, memo) / readMemo(artifactDir, caseId)
 *   listMemos(artifactDir) / deleteMemo(artifactDir, caseId)
 *   validateMemo(memo) → 契約違反の説明文の配列
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "result-memo-schema.json");
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

export function resultsDir(artifactDir) {
  return join(dirname(artifactDir), ".spec-testing-results");
}

export function memoPath(artifactDir, caseId) {
  return join(resultsDir(artifactDir), `${caseId}.json`);
}

function checkKeyword(kw) {
  // items は validateAt に実装が無い。素通りを避けるためホワイトリストから外し、
  // スキーマに items を書いた瞬間 throw させる (実装を追加してから戻す)
  const supported = ["$schema", "type", "enum", "pattern", "required", "properties", "additionalProperties", "minimum"];
  if (!supported.includes(kw)) {
    throw new Error(`result-memo-schema.json は未対応のキーワード "${kw}" を含む。この検証機は type / enum / pattern / required / minimum / additionalProperties だけを解釈する`);
  }
}

function typeOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function validateAt(value, schema, path, problems) {
  for (const kw of Object.keys(schema)) checkKeyword(kw);

  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === "integer" ? t === "integer" : t === schema.type;
    if (!ok) {
      problems.push(`${path}: type が ${schema.type} でない (実際: ${t})`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    problems.push(`${path}: enum ${JSON.stringify(schema.enum)} に含まれない (実際: ${JSON.stringify(value)})`);
  }

  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(String(value))) {
    problems.push(`${path}: pattern ${schema.pattern} に一致しない (実際: ${JSON.stringify(value)})`);
  }

  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    problems.push(`${path}: minimum ${schema.minimum} 未満 (実際: ${value})`);
  }

  if (schema.type === "object") {
    for (const req of schema.required ?? []) {
      if (!(req in (value ?? {}))) problems.push(`${path}.${req}: 必須フィールドが無い`);
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value ?? {})) {
        if (!(key in schema.properties)) problems.push(`${path}.${key}: 未知のフィールド`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in (value ?? {})) validateAt(value[key], sub, `${path}.${key}`, problems);
    }
  }
}

export function validateMemo(memo) {
  const problems = [];
  validateAt(memo, SCHEMA, "memo", problems);
  return problems;
}

export function writeMemo(artifactDir, memo) {
  const problems = validateMemo(memo);
  if (problems.length > 0) {
    throw new Error(`結果メモがスキーマに合わない:\n  ${problems.join("\n  ")}`);
  }
  const dir = resultsDir(artifactDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(memoPath(artifactDir, memo.case_id), `${JSON.stringify(memo, null, 2)}\n`, "utf8");
}

export function readMemo(artifactDir, caseId) {
  const path = memoPath(artifactDir, caseId);
  if (!existsSync(path)) return null;
  const memo = JSON.parse(readFileSync(path, "utf8"));
  const problems = validateMemo(memo);
  if (problems.length > 0) {
    throw new Error(`結果メモ ${caseId} がスキーマに合わない:\n  ${problems.join("\n  ")}`);
  }
  return memo;
}

export function listMemos(artifactDir) {
  const dir = resultsDir(artifactDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const caseId = name.replace(/\.json$/, "");
    out.push({ caseId, memo: readMemo(artifactDir, caseId) });
  }
  return out;
}

export function deleteMemo(artifactDir, caseId) {
  const path = memoPath(artifactDir, caseId);
  if (existsSync(path)) unlinkSync(path);
}
