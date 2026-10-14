import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCases, readCases } from "./ledger.mjs";
import { casesPath, evidenceDir } from "./paths.mjs";
import { returnCase } from "./return-case.mjs";
import { RETURNS_MAX } from "./constants.mjs";

function fresh() {
  const root = mkdtempSync(join(tmpdir(), "return-case-test-"));
  const artifact = join(root, "some-spec");
  mkdirSync(artifact, { recursive: true });
  return { root, artifact };
}

function baseRow(over) {
  return {
    case_id: "T-001", level: "unit", req_ids: "R-001", technique: "境界値", box: "white",
    title: "t", preconditions: "", steps: "", expected: "", status: "pass",
    out_of_scope_reason: "", attempts: "1", returns: "0", evidence_path: "evidence/T-001/", test_code_path: "", updated_at: "",
    ...over,
  };
}

function setup(artifact, over = {}) {
  writeCases(casesPath(artifact), [baseRow(over)]);
  mkdirSync(evidenceDir(artifact, "T-001"), { recursive: true });
  writeFileSync(join(evidenceDir(artifact, "T-001"), "commands.md"), "x", "utf8");
}

test("returnCase: 差し戻し 1 回目は台帳を todo に戻し attempts は増やさない", () => {
  const { root, artifact } = fresh();
  setup(artifact, { status: "pass", attempts: "1" });
  const r = returnCase(artifact, "T-001", "ログが薄い");
  assert.equal(r.action, "returned");
  assert.equal(r.returns, 1);
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "todo");
  assert.equal(after[0].attempts, "1", "attempts は変えない");
  assert.equal(after[0].returns, "1", "returns は台帳の列で数える");
  assert.equal(existsSync(evidenceDir(artifact, "T-001")), false, "証跡を消す");
  rmSync(root, { recursive: true, force: true });
});

test("returnCase: 周回をまたいでも returns は台帳に残り、RETURNS_MAX に到達する", () => {
  const { root, artifact } = fresh();
  // 台帳に T-001 の 1 行を書く (returns=0)
  setup(artifact, { status: "pass", returns: "0" });

  // 1 回目の差し戻し
  const r1 = returnCase(artifact, "T-001", "証跡不十分");
  assert.equal(r1.action, "returned");
  assert.equal(r1.returns, 1);
  assert.equal(readCases(casesPath(artifact))[0].returns, "1");

  // 次周回で case が再選出され、実行係が再度証跡と台帳行 (status=pass) を作り直したという想定
  writeCases(casesPath(artifact), [{ ...readCases(casesPath(artifact))[0], status: "pass" }]);
  mkdirSync(evidenceDir(artifact, "T-001"), { recursive: true });
  writeFileSync(join(evidenceDir(artifact, "T-001"), "commands.md"), "x", "utf8");

  // 2 回目の差し戻し
  const r2 = returnCase(artifact, "T-001", "証跡不十分");
  assert.equal(r2.action, "returned");
  assert.equal(r2.returns, 2);
  assert.equal(readCases(casesPath(artifact))[0].returns, "2");

  // 3 回目 (RETURNS_MAX=2 に到達済み): returns はそのまま、action は kept
  writeCases(casesPath(artifact), [{ ...readCases(casesPath(artifact))[0], status: "pass" }]);
  const r3 = returnCase(artifact, "T-001", "証跡不十分");
  assert.equal(r3.action, "kept");
  assert.equal(r3.returns, RETURNS_MAX);
  assert.equal(readCases(casesPath(artifact))[0].returns, String(RETURNS_MAX));

  rmSync(root, { recursive: true, force: true });
});

test("returnCase: RETURNS_MAX に達したら台帳を触らず kept を返す", () => {
  const { root, artifact } = fresh();
  setup(artifact, { status: "pass", returns: String(RETURNS_MAX) });
  const r = returnCase(artifact, "T-001", "しつこく差し戻す");
  assert.equal(r.action, "kept");
  const after = readCases(casesPath(artifact));
  assert.equal(after[0].status, "pass", "台帳を触らない (元の status のまま)");
  assert.equal(after[0].returns, String(RETURNS_MAX));
  assert.notEqual(after[0].status, "error", "元の status を error に化けさせない");
  rmSync(root, { recursive: true, force: true });
});

test("returnCase: 差し戻し理由を戻り値で返す", () => {
  const { root, artifact } = fresh();
  setup(artifact);
  const r = returnCase(artifact, "T-001", "使い回しの疑い");
  assert.equal(r.reason, "使い回しの疑い");
  assert.equal(r.returns, 1);
  rmSync(root, { recursive: true, force: true });
});

test("returnCase: caseId が T-001 形式でないと throw し、パス操作前に止まる", () => {
  const { root, artifact } = fresh();
  // evidenceDir(artifact, "../../evil") が指す先 (artifact の 2 階層上) にカナリアを置く
  const canary = join(root, "evil");
  const canaryFile = join(canary, "keep.txt");
  mkdirSync(canary, { recursive: true });
  writeFileSync(canaryFile, "safe", "utf8");

  // 台帳に case_id: "../../evil" の行を仕込む。これが無いと readCases 後の
  // idx === -1 分岐が先に throw してしまい、ガードを削除しても green のままになる
  // (recovery.test.mjs の deleteOrphanEvidence 用テストと同じ仕込み方)。
  writeCases(casesPath(artifact), [baseRow({ case_id: "../../evil", status: "todo" })]);

  assert.throws(() => returnCase(artifact, "../../evil", "reason"));
  assert.equal(existsSync(canary), true, "artifact 外の canary ディレクトリは残っていなければならない");
  assert.equal(existsSync(canaryFile), true, "caseId 検証前にファイルへ触れてはならない");

  rmSync(root, { recursive: true, force: true });
});
