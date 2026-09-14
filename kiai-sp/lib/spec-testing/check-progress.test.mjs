import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeCases, writeRequirements } from "./ledger.mjs";
import { parseArgs, runCheck } from "./check-progress.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "check-progress.mjs");

function aCase(over = {}) {
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

function aReq(over = {}) {
  return {
    req_id: "R-001",
    spec_section: "決定事項",
    quote: "なにか",
    testable: "yes",
    untestable_reason: "",
    ...over,
  };
}

function withArtifactDir(cases, requirements, fn) {
  const dir = mkdtempSync(join(tmpdir(), "spec-testing-check-"));
  try {
    writeCases(join(dir, "cases.tsv"), cases);
    writeRequirements(join(dir, "requirements.tsv"), requirements);
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("parseArgs は --dir と --phase を読む", () => {
  assert.deepEqual(parseArgs(["--dir", "/a", "--phase", "execution"]), {
    dir: "/a",
    phase: "execution",
  });
});

test("--dir が無ければ検査不能の 2 で終わる", () => {
  const r = runCheck({ dir: null, phase: "execution" });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--dir/);
});

test("知らない --phase は検査不能の 2 で終わる", () => {
  const r = runCheck({ dir: "/a", phase: "phase1" });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--phase/);
});

test("台帳が無ければ検査不能の 2 で終わる", () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-testing-check-empty-"));
  try {
    const r = runCheck({ dir, phase: "execution" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /cases\.tsv/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("台帳が契約に反していれば検査不能の 2 で、違反を全部出す", () => {
  withArtifactDir([aCase({ status: "running", box: "gray" })], [aReq()], (dir) => {
    const r = runCheck({ dir, phase: "execution" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /status/);
    assert.match(r.stderr, /box/);
  });
});

test("requirements.tsv の testable/untestable_reason が対応していなければ検査不能の 2 で終わる", () => {
  withArtifactDir(
    [aCase({ status: "todo" })],
    [aReq({ testable: "no", untestable_reason: "" })],
    (dir) => {
      const r = runCheck({ dir, phase: "execution" });
      assert.equal(r.code, 2);
      assert.match(r.stderr, /requirements\.tsv/);
      assert.match(r.stderr, /untestable_reason/);
    },
  );
});

test("todo が残っていれば未完の 1 で終わる", () => {
  withArtifactDir([aCase({ status: "todo" })], [aReq()], (dir) => {
    const r = runCheck({ dir, phase: "execution" });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /"todo": 1/);
  });
});

test("実施フェーズで todo が 0 なら fail が残っていても 0 で終わる", () => {
  withArtifactDir([aCase({ status: "fail" })], [aReq()], (dir) => {
    assert.equal(runCheck({ dir, phase: "execution" }).code, 0);
  });
});

test("生成フェーズは被覆が埋まっていれば todo が残っていても 0 で終わる", () => {
  withArtifactDir([aCase({ status: "todo", req_ids: "R-001" })], [aReq()], (dir) => {
    assert.equal(runCheck({ dir, phase: "generation" }).code, 0);
  });
});

test("生成フェーズで被覆漏れがあれば 1 で終わり、理由に要件 ID が出る", () => {
  withArtifactDir(
    [aCase({ req_ids: "R-001" })],
    [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" })],
    (dir) => {
      const r = runCheck({ dir, phase: "generation" });
      assert.equal(r.code, 1);
      assert.match(r.stdout, /R-002/);
    },
  );
});

test("progress.json を書き、2 回目は前回分を progress.prev.json へ回す", () => {
  withArtifactDir([aCase({ status: "todo" })], [aReq()], (dir) => {
    runCheck({ dir, phase: "execution" });
    assert.equal(existsSync(join(dir, "progress.json")), true);
    assert.equal(existsSync(join(dir, "progress.prev.json")), false);

    writeCases(join(dir, "cases.tsv"), [aCase({ status: "pass" })]);
    runCheck({ dir, phase: "execution" });

    const prev = JSON.parse(readFileSync(join(dir, "progress.prev.json"), "utf8"));
    const now = JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
    assert.equal(prev.todo, 1);
    assert.equal(now.todo, 0);
    assert.equal(now.advanced_this_turn, 1);
  });
});

test("前ターンから todo が減っていなければ advanced_this_turn が 0 になる", () => {
  withArtifactDir([aCase({ status: "todo" })], [aReq()], (dir) => {
    runCheck({ dir, phase: "execution" });
    runCheck({ dir, phase: "execution" });
    const now = JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
    assert.equal(now.advanced_this_turn, 0);
  });
});

test("CLI として直接叩いても同じ終了コードを返す", () => {
  withArtifactDir([aCase({ status: "pass" })], [aReq()], (dir) => {
    const out = execFileSync("node", [CLI, "--dir", dir, "--phase", "execution"], {
      encoding: "utf8",
    });
    assert.match(out, /"done": true/);

    writeCases(join(dir, "cases.tsv"), [aCase({ status: "todo" })]);
    assert.throws(
      () => execFileSync("node", [CLI, "--dir", dir, "--phase", "execution"], { stdio: "pipe" }),
      (err) => err.status === 1,
    );
  });
});
