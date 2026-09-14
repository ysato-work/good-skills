/**
 * progress.mjs
 *
 * 台帳を集計して進捗を出し、フェーズごとの完了可否を決める。ファイルには触らない。
 *
 * 完了条件をフェーズで分けているのが肝である。実施フェーズのゲートに要件の被覆を
 * 含めると永久にブロックされる。被覆されていない要件は生成フェーズにしか直せず、
 * 実施フェーズでいくらテストを消化しても解消しないからである。
 *
 * uncovered_req_ids に入れるのは testable が yes の要件だけ。no の要件にはテスト
 * ケースが紐づかないので、除外しないと生成フェーズのゲートが永久に解けない。
 * AI が自律的にテストできないものはテストしなくてよい、という前提に沿った扱いで、
 * 被覆されないこと自体は失敗ではない。
 *
 * fail が残っていても完了とする。FAIL の修正はこのスキル群のスコープ外である。
 *
 * advanced_this_turn は S5 が「前進 0 が続いたら自主停止する」判定に使う材料である。
 * 前ターンの集計が無い、または壊れている場合は 0 を返す。S5 の許容ターン数が 1 では
 * ないので、初回の 0 で止まることはない。
 *
 * export:
 *   PHASES
 *   computeProgress({ cases, requirements, prev, phase }) → 進捗オブジェクト
 */
import { parseReqIds } from "./ledger.mjs";

export const PHASES = ["generation", "execution"];

export function computeProgress({ cases = [], requirements = [], prev = null, phase }) {
  if (!PHASES.includes(phase)) {
    throw new Error(`phase は ${PHASES.join(" / ")} のどちらか。受け取った値: ${phase}`);
  }

  const counts = { todo: 0, pass: 0, fail: 0, out_of_scope: 0, error: 0 };
  for (const row of cases) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] += 1;
  }

  const covered = new Set();
  for (const row of cases) {
    for (const id of parseReqIds(row.req_ids)) covered.add(id);
  }

  const uncovered = requirements
    .filter((r) => r.testable === "yes" && !covered.has(r.req_id))
    .map((r) => r.req_id)
    .sort();

  const prevTodo = Number.isInteger(prev?.todo) ? prev.todo : null;
  const advanced = prevTodo === null ? 0 : Math.max(0, prevTodo - counts.todo);

  const reasons = [];
  if (phase === "generation") {
    if (requirements.length === 0) reasons.push("requirements.tsv に要件が 1 件も無い");
    for (const id of uncovered) reasons.push(`要件 ${id} にテストケースが 1 件も紐づいていない`);
  } else {
    if (cases.length === 0) reasons.push("cases.tsv にテストケースが 1 件も無い");
    if (counts.todo > 0) reasons.push(`todo が ${counts.todo} 件残っている`);
  }

  return {
    total: cases.length,
    todo: counts.todo,
    pass: counts.pass,
    fail: counts.fail,
    out_of_scope: counts.out_of_scope,
    error: counts.error,
    uncovered_req_ids: uncovered,
    advanced_this_turn: advanced,
    done: reasons.length === 0,
    reasons,
  };
}
