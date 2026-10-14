import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resultsDir,
  memoPath,
  writeMemo,
  readMemo,
  listMemos,
  deleteMemo,
  validateMemo,
} from "./result-memo.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "result-memo-test-"));
}

function goodMemo(over = {}) {
  return {
    case_id: "T-001",
    status: "pass",
    summary: "ok",
    evidence_dir: "evidence/T-001",
    test_code_path: "",
    finished_at: "2026-09-15T10:00:00.000Z",
    ...over,
  };
}

test("resultsDir は artifactDir の親配下 .spec-testing-results", () => {
  const dir = "/foo/bar/testing/some-spec";
  assert.equal(resultsDir(dir), "/foo/bar/testing/.spec-testing-results");
});

test("memoPath は case_id.json", () => {
  const dir = "/foo/bar/testing/some-spec";
  assert.equal(memoPath(dir, "T-001"), "/foo/bar/testing/.spec-testing-results/T-001.json");
});

test("validateMemo は正しいメモに問題を返さない", () => {
  assert.deepEqual(validateMemo(goodMemo()), []);
});

test("validateMemo は case_id 形式違反を検出する", () => {
  const problems = validateMemo(goodMemo({ case_id: "X-001" }));
  assert.ok(problems.length > 0);
  assert.ok(problems.some((p) => /case_id/.test(p)));
});

test("validateMemo は不正な status を検出する", () => {
  const problems = validateMemo(goodMemo({ status: "todo" }));
  assert.ok(problems.some((p) => /status/.test(p)));
});

test("validateMemo は out_of_scope を弾く", () => {
  const problems = validateMemo(goodMemo({ status: "out_of_scope" }));
  assert.ok(problems.length > 0);
});

test("validateMemo は finished_at が非 ISO 文字列だと弾く", () => {
  const problems = validateMemo(goodMemo({ finished_at: "2026/09/15" }));
  assert.ok(problems.some((p) => /finished_at/.test(p)));
});

test("writeMemo は成果物ディレクトリの親配下に書く。読み戻せる", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  const memo = goodMemo();
  writeMemo(artifact, memo);
  assert.equal(existsSync(memoPath(artifact, "T-001")), true);
  assert.deepEqual(readMemo(artifact, "T-001"), memo);
  rmSync(root, { recursive: true, force: true });
});

test("writeMemo はスキーマ違反を throw する", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  assert.throws(() => writeMemo(artifact, goodMemo({ status: "bogus" })));
  rmSync(root, { recursive: true, force: true });
});

test("readMemo は存在しなければ null", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  assert.equal(readMemo(artifact, "T-999"), null);
  rmSync(root, { recursive: true, force: true });
});

test("readMemo は壊れた JSON を throw する", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  const rdir = join(root, ".spec-testing-results");
  mkdirSync(artifact, { recursive: true });
  mkdirSync(rdir, { recursive: true });
  writeFileSync(join(rdir, "T-001.json"), "{ broken", "utf8");
  assert.throws(() => readMemo(artifact, "T-001"));
  rmSync(root, { recursive: true, force: true });
});

test("listMemos は全メモを返す", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  writeMemo(artifact, goodMemo({ case_id: "T-001" }));
  writeMemo(artifact, goodMemo({ case_id: "T-002", status: "fail" }));
  const memos = listMemos(artifact);
  assert.equal(memos.length, 2);
  const ids = memos.map((m) => m.caseId).sort();
  assert.deepEqual(ids, ["T-001", "T-002"]);
  rmSync(root, { recursive: true, force: true });
});

test("deleteMemo でファイルが消える。存在しなくてもエラーにならない", () => {
  const root = tmp();
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  writeMemo(artifact, goodMemo());
  deleteMemo(artifact, "T-001");
  assert.equal(existsSync(memoPath(artifact, "T-001")), false);
  deleteMemo(artifact, "T-999"); // 例外にならないこと
  rmSync(root, { recursive: true, force: true });
});
