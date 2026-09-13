/**
 * next-case.mjs
 *
 * 次に消化する行を選ぶ。選び方は「台帳の上から最初の todo」の 1 本だけ。
 *
 * ここに選択肢を作らないことが、スキップ禁止の実体である。「これは偽陽性だろう」
 * 「すでに他で確認済みだ」「時間がかかりそうだ」といった判断が入り込む隙を、
 * そもそも作らない。親は返ってきた行を消化するしかない。
 *
 * level で並べ替えない。台帳は生成時に unit -> integration -> e2e の順で確定して
 * いるので、並び順にそのまま従えばレベルごとにまとまって消化される。ここで並べ
 * 替えると、環境を立てる回数が増える。
 *
 * 試行上限に達した todo は起動せず exhaust を返す。無人実行では、1 件の再試行で
 * 全体が終わらなくなるのが一番困る。
 *
 * export:
 *   selectNext(rows, opts) → { index, case_id, action } | null
 *   remainingTodo(rows)    → todo の件数
 *   progressLine(rows)     → 親が 1 行だけ出す進捗
 */
import { MAX_ATTEMPTS } from "../../../lib/spec-testing/constants.mjs";

export function selectNext(rows, { maxAttempts = MAX_ATTEMPTS } = {}) {
  const index = rows.findIndex((r) => r.status === "todo");
  if (index === -1) return null;

  const row = rows[index];
  const attempts = Number.parseInt(row.attempts, 10);
  const action = Number.isInteger(attempts) && attempts < maxAttempts ? "run" : "exhaust";

  return { index, case_id: row.case_id, action };
}

export function remainingTodo(rows) {
  return rows.filter((r) => r.status === "todo").length;
}

export function progressLine(rows) {
  const count = (status) => rows.filter((r) => r.status === status).length;
  const todo = count("todo");
  const done = rows.length - todo;

  return (
    `${rows.length} 件中 ${done} 件消化 ` +
    `(pass ${count("pass")} / fail ${count("fail")} / error ${count("error")} / ` +
    `out_of_scope ${count("out_of_scope")})、残り todo ${todo} 件`
  );
}
