import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCases, readCases } from "./ledger.mjs";
import { casesPath, evidenceDir, commandsPath } from "./paths.mjs";
import { writeMemo, memoPath } from "./result-memo.mjs";
import { applyPendingMemos, deleteOrphanEvidence } from "./recovery.mjs";
import { renderCommands } from "./evidence.mjs";

function fresh() {
  const root = mkdtempSync(join(tmpdir(), "recovery-test-"));
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  return { root, artifact };
}

function row(over) {
  return {
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    technique: "境界値",
    box: "white",
    title: "t",
    preconditions: "",
    steps: "",
    expected: "",
    status: "todo",
    out_of_scope_reason: "",
    attempts: "0",
    evidence_path: "",
    test_code_path: "",
    updated_at: "",
    ...over,
  };
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

function withEvidence(artifact, caseId) {
  mkdirSync(evidenceDir(artifact, caseId), { recursive: true });
  writeFileSync(
    commandsPath(artifact, caseId),
    renderCommands(caseId, [{ command: "x", exitCode: 0, logFile: "1.log" }]),
    "utf8",
  );
  writeFileSync(join(evidenceDir(artifact, caseId), "1.log"), "output\n", "utf8");
}

test("applyPendingMemos: 未反映メモを畳み込むと台帳の status が更新される", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [row({ case_id: "T-001" })]);
  withEvidence(artifact, "T-001");
  writeMemo(artifact, goodMemo());

  const r = applyPendingMemos(artifact);
  assert.equal(r.applied.length, 1);
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "pass");
  assert.equal(existsSync(memoPath(artifact, "T-001")), false, "反映済みメモは消える");

  rmSync(root, { recursive: true, force: true });
});

test("applyPendingMemos: 何度呼んでも結果が変わらない (冪等)", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [row({ case_id: "T-001" })]);
  withEvidence(artifact, "T-001");
  writeMemo(artifact, goodMemo());
  applyPendingMemos(artifact);
  const first = readCases(casesPath(artifact));
  applyPendingMemos(artifact); // 2 度目
  const second = readCases(casesPath(artifact));
  assert.deepEqual(second, first);
  rmSync(root, { recursive: true, force: true });
});

test("deleteOrphanEvidence: 台帳が todo なのに evidence がある行の証跡を消す", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [row({ case_id: "T-001" })]);
  withEvidence(artifact, "T-001");
  const deleted = deleteOrphanEvidence(artifact);
  assert.deepEqual(deleted, ["T-001"]);
  assert.equal(existsSync(evidenceDir(artifact, "T-001")), false);
  rmSync(root, { recursive: true, force: true });
});

test("deleteOrphanEvidence: pass の行の証跡は消さない", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [row({ case_id: "T-001", status: "pass", attempts: "1", evidence_path: "evidence/T-001/" })]);
  withEvidence(artifact, "T-001");
  const deleted = deleteOrphanEvidence(artifact);
  assert.deepEqual(deleted, []);
  assert.equal(existsSync(evidenceDir(artifact, "T-001")), true);
  rmSync(root, { recursive: true, force: true });
});

test("deleteOrphanEvidence: case_id が T-001 形式でない行はパス構築・削除を試みずスキップする", () => {
  const { root, artifact } = fresh();
  // artifact = root/some-spec なので、evidenceDir(artifact, "../../evil") は
  // root/some-spec/evidence/../../evil = root/evil に解決される。
  // root は canary の置き場としてこのテストが管理し、最後に丸ごと削除する。
  const canaryDir = join(root, "evil");
  const canaryFile = join(canaryDir, "keep.txt");
  mkdirSync(canaryDir, { recursive: true });
  writeFileSync(canaryFile, "do not delete me\n", "utf8");

  writeCases(casesPath(artifact), [row({ case_id: "../../evil", status: "todo" })]);

  const deleted = deleteOrphanEvidence(artifact);

  assert.deepEqual(deleted, []);
  assert.equal(existsSync(canaryDir), true, "artifact 外の canary ディレクトリは残っていなければならない");
  assert.equal(existsSync(canaryFile), true, "canary ディレクトリの中身も残っていなければならない");

  rmSync(root, { recursive: true, force: true });
});
