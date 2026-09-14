/**
 * validate-json.mjs
 *
 * このスキルが使う語彙だけに対応した最小の JSON Schema 検証。
 *
 * ajv-cli を使わないのは、npx が実行時にネットワークを要求するため。
 * このスキルはサンドボックス制約下で動くことが前提なので、検証手段が
 * ネットワークに依存してはならない（spec §9.4 からの意図的な逸脱）。
 *
 * 対応していないキーワードは throw する。黙って通すと「検証したつもり」になる。
 */
import { readFileSync } from "node:fs";

const SUPPORTED = new Set([
  "$schema", "type", "required", "properties", "additionalProperties", "items",
  "enum", "pattern", "minimum", "maximum", "minItems", "minLength", "maxLength", "description",
]);

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function validateJson(value, schema, path = "") {
  for (const k of Object.keys(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`unsupported schema keyword: ${k}`);
  }
  const at = path || "(root)";
  const errors = [];

  if (schema.type) {
    const actual = typeOf(value);
    const want = schema.type;
    const ok =
      want === "integer" ? Number.isInteger(value) :
      want === "number" ? actual === "number" :
      actual === want;
    if (!ok) return [`${at}: expected ${want}, got ${actual}`];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: not one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) {
    errors.push(`${at}: expected at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && typeof value === "string" && value.length > schema.maxLength) {
    errors.push(`${at}: expected at most ${schema.maxLength} characters`);
  }
  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) {
    errors.push(`${at}: ${value} < ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && typeof value === "number" && value > schema.maximum) {
    errors.push(`${at}: ${value} > ${schema.maximum}`);
  }

  if (typeOf(value) === "object") {
    for (const k of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) {
        errors.push(`${at}: missing required property: ${k}`);
      }
    }
    const props = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) {
          errors.push(`${at}: unexpected property: ${k}`);
        }
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        errors.push(...validateJson(value[k], sub, path ? `${path}.${k}` : k));
      }
    }
  }

  if (typeOf(value) === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at}: expected at least ${schema.minItems} items, got ${value.length}`);
    }
    if (schema.items) {
      value.forEach((v, i) => errors.push(...validateJson(v, schema.items, `${path}[${i}]`)));
    }
  }

  return errors;
}

function isMain() {
  return process.argv[1] && process.argv[1].endsWith("validate-json.mjs");
}

if (isMain()) {
  const [dataPath, schemaPath] = process.argv.slice(2);
  if (!dataPath || !schemaPath) {
    process.stderr.write("Usage: node validate-json.mjs <data.json> <schema.json>\n");
    process.exit(2);
  }
  let errors;
  try {
    errors = validateJson(JSON.parse(readFileSync(dataPath, "utf8")), JSON.parse(readFileSync(schemaPath, "utf8")));
  } catch (e) {
    process.stderr.write(`FAIL ${e.message}\n`);
    process.exit(1);
  }
  if (errors.length === 0) {
    process.stdout.write("PASS\n");
    process.exit(0);
  }
  process.stderr.write("FAIL\n" + errors.map((e) => `  - ${e}`).join("\n") + "\n");
  process.exit(1);
}
