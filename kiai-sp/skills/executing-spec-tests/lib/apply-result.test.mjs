import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ATTEMPTS } from "../../../lib/spec-testing/constants.mjs";
import { readCases, writeCases } from "../../../lib/spec-testing/ledger.mjs";
import { casesPath, evidenceDir } from "../../../lib/spec-testing/paths.mjs";
import {
  applyResult,
  assertResultStatus,
  decideStatus,
  hasEvidence,
} from "./apply-result.mjs";

function row(over = {}) {
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

function withArtifactDir(rows, fn, { evidenceFor = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apply-result-"));
  try {
    writeCases(casesPath(dir), rows);
    for (const id of evidenceFor) {
      mkdirSync(evidenceDir(dir, id), { recursive: true });
      writeFileSync(join(evidenceDir(dir, id), "commands.md"), "# T 実行コマンド\n", "utf8");
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("実施時に書ける status は pass / fail / error だけ", () => {
  for (const s of ["pass", "fail", "error"]) assert.doesNotThrow(() => assertResultStatus(s));
});

test("実施時に out_of_scope を書こうとしたら throw する", () => {
  assert.throws(() => assertResultStatus("out_of_scope"), /out_of_scope/);
});

test("実施時に todo を書こうとしたら throw する", () => {
  assert.throws(() => assertResultStatus("todo"), /todo/);
});

test("hasEvidence は commands.md の有無で判定する", () => {
  withArtifactDir([row()], (dir) => {
    assert.equal(hasEvidence(dir, "T-001"), false);
  });
  withArtifactDir([row()], (dir) => {
    assert.equal(hasEvidence(dir, "T-001"), true);
  }, { evidenceFor: ["T-001"] });
});

test("hasEvidence は空の commands.md を証跡と認めない", () => {
  const dir = mkdtempSync(join(tmpdir(), "apply-result-empty-"));
  try {
    mkdirSync(evidenceDir(dir, "T-001"), { recursive: true });
    writeFileSync(join(evidenceDir(dir, "T-001"), "commands.md"), "", "utf8");
    assert.equal(hasEvidence(dir, "T-001"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("証跡があれば報告された合否をそのまま採る", () => {
  const d = decideStatus({ reported: "pass", evidence: true, attempts: 1, maxAttempts: 3 });
  assert.equal(d.status, "pass");
  assert.equal(d.downgraded, false);
  assert.equal(d.retrying, false);
});

test("証跡が無ければ pass でも error に落とす", () => {
  const d = decideStatus({ reported: "pass", evidence: false, attempts: 3, maxAttempts: 3 });
  assert.equal(d.status, "error");
  assert.equal(d.downgraded, true);
  assert.match(d.reason, /証跡/);
});

test("error は試行上限まで todo に戻して再試行させる", () => {
  const d = decideStatus({ reported: "error", evidence: true, attempts: 1, maxAttempts: 3 });
  assert.equal(d.status, "todo");
  assert.equal(d.retrying, true);
});

test("error が試行上限に達したら error のまま確定する", () => {
  const d = decideStatus({ reported: "error", evidence: true, attempts: 3, maxAttempts: 3 });
  assert.equal(d.status, "error");
  assert.equal(d.retrying, false);
});

test("fail は再試行しない", () => {
  const d = decideStatus({ reported: "fail", evidence: true, attempts: 1, maxAttempts: 3 });
  assert.equal(d.status, "fail");
  assert.equal(d.retrying, false);
});

test("applyResult は台帳の該当行だけを更新する", () => {
  withArtifactDir([row({ case_id: "T-001" }), row({ case_id: "T-002" })], (dir) => {
    applyResult(dir, "T-001", { status: "pass" }, { now: "2026-09-01T00:00:00.000Z" });
    const rows = readCases(casesPath(dir));
    assert.equal(rows[0].status, "pass");
    assert.equal(rows[0].attempts, "1");
    assert.equal(rows[0].evidence_path, "evidence/T-001/");
    assert.equal(rows[0].updated_at, "2026-09-01T00:00:00.000Z");
    assert.equal(rows[1].status, "todo", "他の行が動いている");
  }, { evidenceFor: ["T-001"] });
});

test("applyResult はテストコードのパスを記録する", () => {
  withArtifactDir([row()], (dir) => {
    applyResult(dir, "T-001", { status: "pass", testCodePath: "src/a.test.ts" }, {});
    assert.equal(readCases(casesPath(dir))[0].test_code_path, "src/a.test.ts");
  }, { evidenceFor: ["T-001"] });
});

test("applyResult は証跡が無い結果を error にする", () => {
  withArtifactDir([row()], (dir) => {
    const out = applyResult(dir, "T-001", { status: "pass" }, { maxAttempts: 1 });
    assert.equal(out.status, "error");
    assert.equal(out.downgraded, true);
    assert.equal(readCases(casesPath(dir))[0].evidence_path, "");
  });
});

test("applyResult は試行回数を必ず増やす", () => {
  withArtifactDir([row({ attempts: "1" })], (dir) => {
    applyResult(dir, "T-001", { status: "fail" }, {});
    assert.equal(readCases(casesPath(dir))[0].attempts, "2");
  }, { evidenceFor: ["T-001"] });
});

test("applyResult は台帳に無い case_id を throw する", () => {
  withArtifactDir([row()], (dir) => {
    assert.throws(() => applyResult(dir, "T-999", { status: "pass" }, {}), /T-999/);
  });
});

test("applyResult は out_of_scope を書かせない", () => {
  withArtifactDir([row()], (dir) => {
    assert.throws(() => applyResult(dir, "T-001", { status: "out_of_scope" }, {}), /out_of_scope/);
  });
});

test("試行上限の既定は S1 の定数を使う", () => {
  withArtifactDir([row({ attempts: String(MAX_ATTEMPTS - 1) })], (dir) => {
    const out = applyResult(dir, "T-001", { status: "error" }, {});
    assert.equal(out.status, "error", "上限に達したので確定するはず");
  }, { evidenceFor: ["T-001"] });
});

test("applyResult は書き戻した台帳を S1 の形式のまま保つ", () => {
  const steps = "1. 立てる\n2. 叩く\tHTTP";
  withArtifactDir([row({ steps })], (dir) => {
    applyResult(dir, "T-001", { status: "pass" }, {});
    assert.equal(readCases(casesPath(dir))[0].steps, steps);
  }, { evidenceFor: ["T-001"] });
});
