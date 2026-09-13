/**
 * build-ledger.mjs
 *
 * レビュー合議を抜けた内部表現を、S1 の台帳形式で書き出す。
 *
 * case_id はここで初めて確定する。レビュー中は並び替えも追加も起きるので、途中で
 * 番号を振ると穴が空くか重複する。level 順に並べ切ってから最後に採番する。
 *
 * S1 の validateCases を必ず通す。契約違反の台帳を書いてしまうと、実施フェーズの
 * 検査スクリプトが「検査できなかった」で止まり続け、原因が生成側にあることが
 * 見えにくくなる。書く前に落とす。
 *
 * 要件が 1 件も紐づいていないケースも落とす。それは「何を確かめているか分からない
 * テスト」であり、受入基準 5 の対応付けが成立しない。
 *
 * export:
 *   sortByLevel(cases) / toCaseRows(cases) / toRequirementRows(requirements)
 *   assertEveryCaseHasRequirement(rows)
 *   buildLedger(artifactDir, { requirements, cases }) → { casesPath, requirementsPath, caseCount }
 */
import {
  CASE_LEVELS,
  caseId,
  validateCases,
  writeCases,
  writeRequirements,
} from "../../../lib/spec-testing/ledger.mjs";
import { casesPath, requirementsPath } from "../../../lib/spec-testing/paths.mjs";

export function sortByLevel(cases) {
  return [...cases].sort((a, b) => CASE_LEVELS.indexOf(a.level) - CASE_LEVELS.indexOf(b.level));
}

export function toCaseRows(cases) {
  return sortByLevel(cases).map((c, i) => ({
    case_id: caseId(i + 1),
    level: c.level ?? "",
    req_ids: Array.isArray(c.req_ids) ? c.req_ids.join(",") : String(c.req_ids ?? ""),
    technique: c.technique ?? "",
    box: c.box ?? "",
    title: c.title ?? "",
    preconditions: c.preconditions ?? "",
    steps: c.steps ?? "",
    expected: c.expected ?? "",
    status: c.status ?? "todo",
    out_of_scope_reason: c.status === "out_of_scope" ? (c.out_of_scope_reason ?? "") : "",
    attempts: "0",
    evidence_path: "",
    test_code_path: "",
    updated_at: "",
  }));
}

export function toRequirementRows(requirements) {
  return requirements.map((r) => ({
    req_id: r.req_id ?? "",
    spec_section: r.spec_section ?? "",
    quote: r.quote ?? "",
    testable: r.testable ?? "",
    untestable_reason: r.testable === "no" ? (r.untestable_reason ?? "") : "",
  }));
}

export function assertEveryCaseHasRequirement(rows) {
  const orphans = rows.filter((r) => String(r.req_ids).trim() === "").map((r) => r.case_id);
  if (orphans.length > 0) {
    throw new Error(`要件が 1 件も紐づいていないテストケースがある: ${orphans.join(", ")}`);
  }
}

export function buildLedger(artifactDir, { requirements = [], cases = [] } = {}) {
  const caseRows = toCaseRows(cases);

  assertEveryCaseHasRequirement(caseRows);

  const problems = validateCases(caseRows);
  if (problems.length > 0) {
    throw new Error(`台帳が S1 の契約に反している\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }

  const casesFile = casesPath(artifactDir);
  const requirementsFile = requirementsPath(artifactDir);
  writeCases(casesFile, caseRows);
  writeRequirements(requirementsFile, toRequirementRows(requirements));

  return { casesPath: casesFile, requirementsPath: requirementsFile, caseCount: caseRows.length };
}
