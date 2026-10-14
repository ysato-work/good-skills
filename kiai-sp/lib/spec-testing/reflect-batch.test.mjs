import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCases, readCases } from "./ledger.mjs";
import { casesPath, evidenceDir, commandsPath } from "./paths.mjs";
import { writeMemo, memoPath } from "./result-memo.mjs";

const SCRIPT = "kiai-sp/lib/spec-testing/reflect-batch.mjs";

function fresh() {
  const root = mkdtempSync(join(tmpdir(), "reflect-batch-test-"));
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  return { root, artifact };
}

function baseRow(over) {
  return {
    case_id: "T-001", level: "unit", req_ids: "R-001", technique: "境界値", box: "white",
    title: "t", preconditions: "", steps: "", expected: "", status: "todo",
    out_of_scope_reason: "", attempts: "0", evidence_path: "", test_code_path: "", updated_at: "",
    ...over,
  };
}

function goodEvidence(artifact, caseId) {
  mkdirSync(evidenceDir(artifact, caseId), { recursive: true });
  writeFileSync(commandsPath(artifact, caseId), `| # | コマンド | 終了コード | ログ |\n|---|---|---|---|\n| 1 | \`x --${caseId}\` | 0 | 1.log |\n`, "utf8");
  writeFileSync(join(evidenceDir(artifact, caseId), "1.log"), `output-${caseId}\n`, "utf8");
}

test("reflect-batch: 検査 OK のメモを反映し、メモを消す", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001" })]);
  goodEvidence(artifact, "T-001");
  writeMemo(artifact, {
    case_id: "T-001", status: "pass", summary: "ok",
    evidence_dir: "evidence/T-001", test_code_path: "",
    finished_at: "2026-09-15T10:00:00.000Z",
  });
  const r = spawnSync("node", [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "T-001"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.applied[0].status, "pass");
  assert.equal(existsSync(memoPath(artifact, "T-001")), false);
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "pass");
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: --exhausted-ids のケースは status: error で確定する", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001", attempts: "3" })]);
  const r = spawnSync("node", [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "", "--exhausted-ids", "T-001"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "error");
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: メモが無いと error 経路で todo に戻る (attempts < MAX_ATTEMPTS)", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001" })]);
  const r = spawnSync("node", [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "T-001"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "todo");
  assert.equal(after[0].attempts, "1");
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: ハッシュ使い回しが検出されたら該当ケースを error 経路に落とす", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001" }), baseRow({ case_id: "T-002" })]);
  for (const id of ["T-001", "T-002"]) {
    mkdirSync(evidenceDir(artifact, id), { recursive: true });
    writeFileSync(commandsPath(artifact, id), "| # | コマンド | 終了コード | ログ |\n|---|---|---|---|\n| 1 | `x` | 0 | 1.log |\n", "utf8");
    writeFileSync(join(evidenceDir(artifact, id), "1.log"), "SAME\n", "utf8");
    writeMemo(artifact, {
      case_id: id, status: "pass", summary: "ok",
      evidence_dir: `evidence/${id}`, test_code_path: "",
      finished_at: "2026-09-15T10:00:00.000Z",
    });
  }
  const r = spawnSync("node", [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "T-001,T-002"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const after = readCases(casesPath(artifact));
  const t1 = after.find((x) => x.case_id === "T-001");
  const t2 = after.find((x) => x.case_id === "T-002");
  assert.equal(t1.status, "todo");
  assert.equal(t2.status, "todo");
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: case_id が T-001 形式でないと、台帳やファイルに触る前に exit code 2 で停止する", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001" })]);
  // T-001.json 形式に読み替えられると schema を満たしてしまう secret を仕掛け、
  // 検証がファイル操作より前に効くことを stderr の文言で確認する (「台帳に無い」
  // という別経路のエラーで偶然 exit 2 になっていないことを保証するため)
  mkdirSync(join(root, ".spec-testing-results"), { recursive: true });
  writeFileSync(
    join(root, "secret.json"),
    JSON.stringify({
      case_id: "../secret", status: "pass", summary: "leak",
      evidence_dir: "evidence/x", test_code_path: "",
      finished_at: "2026-09-15T10:00:00.000Z",
    }),
    "utf8",
  );
  const r = spawnSync(
    "node",
    [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "../secret"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /case_id.*形式/, `想定した形式検証のメッセージでない: ${r.stderr}`);
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: exhausted-ids も同じ形式検証を受ける", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001", attempts: "3" })]);
  const r = spawnSync(
    "node",
    [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "", "--exhausted-ids", "../evil"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /case_id.*形式/, `想定した形式検証のメッセージでない: ${r.stderr}`);
  rmSync(root, { recursive: true, force: true });
});

test("reflect-batch: 実施時に out_of_scope が来たら exit code 2 で停止", () => {
  const { root, artifact } = fresh();
  writeCases(casesPath(artifact), [baseRow({ case_id: "T-001" })]);
  goodEvidence(artifact, "T-001");
  // out_of_scope 相当のメモを手で作る (validateMemo は enum で弾くので、書き込みを別ルートで)
  mkdirSync(join(root, ".spec-testing-results"), { recursive: true });
  writeFileSync(
    memoPath(artifact, "T-001"),
    JSON.stringify({
      case_id: "T-001", status: "out_of_scope", summary: "s",
      evidence_dir: "evidence/T-001", test_code_path: "",
      finished_at: "2026-09-15T10:00:00.000Z",
    }),
    "utf8",
  );
  const r = spawnSync("node", [SCRIPT, "--dir", artifact, "--level", "unit", "--case-ids", "T-001"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  rmSync(root, { recursive: true, force: true });
});
