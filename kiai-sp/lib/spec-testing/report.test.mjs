import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageRows, renderReport } from "./report.mjs";

function aCase(over = {}) {
  const merged = {
    case_id: "T-001",
    level: "unit",
    req_ids: "R-001",
    technique: "境界値",
    box: "white",
    title: "境界の下限",
    preconditions: "",
    steps: "",
    expected: "",
    status: "pass",
    out_of_scope_reason: "",
    attempts: "1",
    test_code_path: "",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
  // 証跡のパスはケース ID から決まる。上書きしない限り追随させる
  return { ...merged, evidence_path: over.evidence_path ?? `evidence/${merged.case_id}/` };
}

function aReq(over = {}) {
  return { req_id: "R-001", spec_section: "決定事項", quote: "q", testable: "yes", untestable_reason: "", ...over };
}

const PROGRESS = { total: 3, todo: 0, pass: 1, fail: 1, error: 1, out_of_scope: 0, uncovered_req_ids: [] };

function fullReport(over = {}) {
  return renderReport({
    specPaths: ["docs/superpowers/specs/2026-08-31-x-design.md"],
    baseBranch: "feature/x",
    diffRange: "abc123..def456",
    cases: [
      aCase({ case_id: "T-001", status: "pass" }),
      aCase({ case_id: "T-002", status: "fail", title: "境界の上限", req_ids: "R-002" }),
      aCase({ case_id: "T-003", status: "error", title: "起動できない", req_ids: "R-002" }),
    ],
    requirements: [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" })],
    progress: PROGRESS,
    environments: [],
    extraCommands: [],
    ...over,
  });
}

test("coverageRows は要件ごとに紐づいたケースを並べる", () => {
  const rows = coverageRows(
    [aCase({ case_id: "T-001", req_ids: "R-001,R-002" }), aCase({ case_id: "T-002", req_ids: "R-002" })],
    [aReq({ req_id: "R-001" }), aReq({ req_id: "R-002" }), aReq({ req_id: "R-003" })],
  );
  assert.deepEqual(rows.map((r) => [r.req_id, r.case_ids]), [
    ["R-001", ["T-001"]],
    ["R-002", ["T-001", "T-002"]],
    ["R-003", []],
  ]);
  assert.equal(rows[2].covered, false);
});

test("testable が no の要件は被覆されていなくても covered 扱いにしない", () => {
  const rows = coverageRows([], [aReq({ req_id: "R-001", testable: "no", untestable_reason: "実機必須" })]);
  assert.equal(rows[0].covered, false);
  assert.equal(rows[0].testable, "no");
});

test("検証対象の節に設計書とブランチと差分の範囲が載る", () => {
  const md = fullReport();
  assert.match(md, /2026-08-31-x-design\.md/);
  assert.match(md, /feature\/x/);
  assert.match(md, /abc123\.\.def456/);
});

test("集計の節に内訳が載る", () => {
  const md = fullReport();
  assert.match(md, /## 集計/);
  assert.match(md, /pass/);
  assert.match(md, /fail/);
  assert.match(md, /error/);
  assert.match(md, /out_of_scope/);
});

test("失敗したケースが証跡へのパス付きで載る", () => {
  const md = fullReport();
  assert.match(md, /T-002/);
  assert.match(md, /境界の上限/);
  assert.match(md, /evidence\/T-002\//);
});

test("実行できなかったケースが失敗と分けて載る", () => {
  const md = fullReport();
  assert.match(md, /## 実行できなかったケース/);
  assert.match(md, /T-003/);
});

test("対象外のケースが理由付きで載る", () => {
  const md = fullReport({
    cases: [aCase({ status: "out_of_scope", out_of_scope_reason: "外部 SaaS への実アクセスが必要" })],
  });
  assert.match(md, /## 対象外のケース/);
  assert.match(md, /外部 SaaS への実アクセスが必要/);
});

test("カバレッジの節に要件とケースの対応が載る", () => {
  const md = fullReport();
  assert.match(md, /## 要件のカバレッジ/);
  assert.match(md, /R-001/);
  assert.match(md, /R-002/);
});

test("テストコードとして実装したもののパスが載る", () => {
  const md = fullReport({
    cases: [aCase({ test_code_path: "src/a.test.ts" }), aCase({ case_id: "T-002", test_code_path: "" })],
  });
  assert.match(md, /## 実装したテストコード/);
  assert.match(md, /src\/a\.test\.ts/);
});

test("立てた環境とその定義ファイルが載る", () => {
  const md = fullReport({ environments: [{ level: "integration", description: "テスト用 DB", path: "compose.test.yml" }] });
  assert.match(md, /## 立てた環境/);
  assert.match(md, /compose\.test\.yml/);
});

test("追加した結合テストと E2E の実行コマンドが載る", () => {
  const md = fullReport({
    extraCommands: [{ level: "integration", command: "npm run test:integration", note: "テスト用 DB が要る" }],
  });
  assert.match(md, /## 追加したテストの実行方法/);
  assert.match(md, /npm run test:integration/);
  assert.match(md, /テスト用 DB が要る/);
});

test("CI に組み込むかは人間が決めると書いてある", () => {
  const md = fullReport({ extraCommands: [{ level: "e2e", command: "npm run test:e2e", note: "" }] });
  assert.match(md, /CI に組み込むかどうか/);
});

test("成功を主張する言い回しを出さない", () => {
  const md = fullReport({
    cases: [aCase({ status: "pass" })],
    progress: { total: 1, todo: 0, pass: 1, fail: 0, error: 0, out_of_scope: 0, uncovered_req_ids: [] },
  });
  for (const phrase of ["問題ありません", "問題はありませんでした", "正常に動作しています", "すべて正常"]) {
    assert.equal(md.includes(phrase), false, `「${phrase}」が出ている`);
  }
});

test("失敗が 0 件でもその旨だけを書き、成功を主張しない", () => {
  const md = fullReport({
    cases: [aCase({ status: "pass" })],
    progress: { total: 1, todo: 0, pass: 1, fail: 0, error: 0, out_of_scope: 0, uncovered_req_ids: [] },
  });
  assert.match(md, /失敗したケースは無い/);
});

test("セル内の改行が表を壊さない", () => {
  const md = fullReport({
    cases: [aCase({ status: "fail", title: "1 行目\n2 行目" })],
  });
  const tableLines = md.split("\n").filter((l) => l.startsWith("| T-001"));
  assert.equal(tableLines.length, 1, "1 ケースが 2 行に割れている");
});
