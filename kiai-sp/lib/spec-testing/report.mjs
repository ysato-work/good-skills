/**
 * report.mjs
 *
 * 台帳と証跡から report.md を組み立てる。
 *
 * **成功を主張させず、証拠を示す。** 「問題ありませんでした」と書かせない。何を
 * どう確認したか、何が失敗したか、何を確認していないかを並べるだけにする。無人
 * 実行では、この文書が人間の唯一の入口になる。
 *
 * fail と error を分けて並べる。前者は「テスト対象に不具合があった」、後者は
 * 「テストを実行できなかった」で、読む人がやることが違う。
 *
 * 追加した結合テストと E2E の実行方法を必ず載せる。このスキルは CI 設定を書き
 * 換えないので、それらを CI に組み込むかどうかは人間が決める。判断材料をここに
 * 置かないと、実行できるテストが誰にも実行されないまま残る。
 *
 * export:
 *   coverageRows(cases, requirements) → 要件ごとの被覆
 *   renderReport(input)               → report.md の本文
 */
import { parseReqIds } from "./ledger.mjs";

/** 表のセルに入れる。改行とパイプで表を壊さない */
function cell(text) {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

export function coverageRows(cases, requirements) {
  return requirements.map((req) => {
    const caseIds = cases
      .filter((c) => parseReqIds(c.req_ids).includes(req.req_id))
      .map((c) => c.case_id);
    return {
      req_id: req.req_id,
      testable: req.testable,
      case_ids: caseIds,
      covered: caseIds.length > 0,
    };
  });
}

function section(title, lines) {
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

function caseTable(rows, extraHeader, extraCell) {
  return [
    `| ケース | レベル | 内容 | ${extraHeader} |`,
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.case_id} | ${r.level} | ${cell(r.title)} | ${extraCell(r)} |`),
  ];
}

export function renderReport({
  specPaths = [],
  baseBranch = "",
  diffRange = "",
  cases = [],
  requirements = [],
  progress = {},
  environments = [],
  extraCommands = [],
} = {}) {
  const byStatus = (status) => cases.filter((c) => c.status === status);
  const failed = byStatus("fail");
  const errored = byStatus("error");
  const outOfScope = byStatus("out_of_scope");
  const withCode = cases.filter((c) => String(c.test_code_path ?? "").trim() !== "");

  const parts = ["# テスト結果", ""];

  parts.push(
    section("検証対象", [
      `- 設計書: ${specPaths.map((p) => `\`${p}\``).join(", ") || "(記録なし)"}`,
      `- ブランチ: \`${baseBranch || "(記録なし)"}\``,
      `- 差分の範囲: \`${diffRange || "(記録なし)"}\``,
    ]),
  );

  parts.push(
    section("集計", [
      "| 状態 | 件数 |",
      "|---|---|",
      `| 総数 | ${progress.total ?? cases.length} |`,
      `| pass | ${progress.pass ?? byStatus("pass").length} |`,
      `| fail | ${progress.fail ?? failed.length} |`,
      `| error | ${progress.error ?? errored.length} |`,
      `| out_of_scope | ${progress.out_of_scope ?? outOfScope.length} |`,
    ]),
  );

  parts.push(
    section(
      "失敗したケース",
      failed.length === 0
        ? ["失敗したケースは無い。"]
        : caseTable(failed, "証跡", (r) => `\`${r.evidence_path || "(証跡なし)"}\``),
    ),
  );

  parts.push(
    section(
      "実行できなかったケース",
      errored.length === 0
        ? ["実行できなかったケースは無い。"]
        : caseTable(errored, "試行回数", (r) => r.attempts),
    ),
  );

  parts.push(
    section(
      "対象外のケース",
      outOfScope.length === 0
        ? ["対象外にしたケースは無い。"]
        : caseTable(outOfScope, "理由", (r) => cell(r.out_of_scope_reason)),
    ),
  );

  parts.push(
    section("要件のカバレッジ", [
      "| 要件 | テスト可能 | 確認したケース |",
      "|---|---|---|",
      ...coverageRows(cases, requirements).map(
        (r) => `| ${r.req_id} | ${r.testable} | ${r.case_ids.join(", ") || "(なし)"} |`,
      ),
    ]),
  );

  parts.push(
    section(
      "実装したテストコード",
      withCode.length === 0
        ? ["テストコードとして実装したものは無い。"]
        : withCode.map((c) => `- ${c.case_id} (${c.level}): \`${c.test_code_path}\``),
    ),
  );

  parts.push(
    section(
      "立てた環境",
      environments.length === 0
        ? ["このスキルが立てた環境は無い。"]
        : environments.map((e) => `- ${e.level}: ${cell(e.description)} — \`${e.path}\``),
    ),
  );

  parts.push(
    section("追加したテストの実行方法", [
      ...(extraCommands.length === 0
        ? ["単体テスト以外に追加したものは無い。"]
        : [
            "| レベル | 実行コマンド | 必要なもの |",
            "|---|---|---|",
            ...extraCommands.map((c) => `| ${c.level} | \`${cell(c.command)}\` | ${cell(c.note) || "-"} |`),
          ]),
      "",
      "このスキルはプロジェクトの CI 設定を変更していない。**CI に組み込むかどうかは、",
      "実行時間・必要な環境・課金の事情を見て人間が決める。**",
    ]),
  );

  return parts.join("\n");
}
