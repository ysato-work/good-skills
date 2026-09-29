import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { interpretFetch, validatePrNumber } from "./fetch-body.mjs";

const CLI_PATH = fileURLToPath(new URL("./fetch-body.mjs", import.meta.url));

test("終了コードが 0 なら本文をそのまま返す", () => {
  const r = interpretFetch({ status: 0, stdout: "## 概要\n本文。\n" });
  assert.deepStrictEqual(r, { ok: true, body: "## 概要\n本文。\n" });
});

test("本文が空の PR は null が返るので空文字にする", () => {
  const r = interpretFetch({ status: 0, stdout: "null\n" });
  assert.deepStrictEqual(r, { ok: true, body: "" });
});

test("本文の中に null という語があっても空文字にしない", () => {
  const r = interpretFetch({ status: 0, stdout: "null を返す関数を直した。\n" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.body, "null を返す関数を直した。\n");
});

test("終了コードが 0 以外なら判定不能にして理由を返す", () => {
  const r = interpretFetch({ status: 1, stderr: "gh: Not Found (HTTP 404)\n" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /Not Found/);
});

test("理由が取れないときも判定不能として終了コードを理由にする", () => {
  const r = interpretFetch({ status: 127, stderr: "" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /127/);
});

test("印を含む本文が切り落とされずに返る", () => {
  const raw = "<!-- pr-desc:begin -->\n本文。\n<!-- pr-desc: sha=abcabcabcabc last-ai-edit=2026-09-14T00:00:00Z -->\n";
  assert.strictEqual(interpretFetch({ status: 0, stdout: raw }).body, raw);
});

test("PR 番号が数字でなければ判定不能にする", () => {
  const r = validatePrNumber("123abc");
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /invalid --pr/);
});

test("PR 番号が空やフラグ風の値でも判定不能にする", () => {
  assert.strictEqual(validatePrNumber("").ok, false);
  assert.strictEqual(validatePrNumber("--out").ok, false);
  assert.strictEqual(validatePrNumber("12 3").ok, false);
  assert.strictEqual(validatePrNumber(undefined).ok, false);
});

test("PR 番号が数字だけなら通る", () => {
  assert.deepStrictEqual(validatePrNumber("124"), { ok: true });
});

test("CLI: 数字でない PR 番号は gh を叩かずに {ok:false} を返す", () => {
  const dir = mkdtempSync(join(tmpdir(), "fetch-body-test-"));
  const out = join(dir, "current-body.md");
  let stdout = "";
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [CLI_PATH, "--pr", "12; rm -rf /", "--out", out], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      stdout = e.stdout;
      throw e;
    }
  });
  assert.strictEqual(JSON.parse(stdout).ok, false);
  assert.strictEqual(existsSync(out), false);
});
