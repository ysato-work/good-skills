/**
 * level-plan.mjs
 *
 * レベルごとに環境を 1 回だけ立てるための判断材料を出す。
 *
 * 台帳は unit -> integration -> e2e の順に並んでいる。上から消化していけば、
 * 同じレベルが連続する。レベルの切れ目で環境を立て、そのレベルを消化しきったら
 * 落とす。ケースごとに立て直さないのは、立ち上げのコストが高く、開発者のマシンで
 * コンテナを何度も起こさないためである。
 *
 * 「今どのレベルか」を親に数えさせない。台帳を渡せば決まる。
 *
 * export:
 *   needsEnvironment(level)     → unit なら false
 *   levelRuns(rows)             → レベルごとの件数
 *   currentLevel(rows)          → 次に消化する行のレベル
 *   levelFinished(rows, level)  → そのレベルの todo が尽きたか
 */
import { CASE_LEVELS } from "../../../lib/spec-testing/ledger.mjs";

export function needsEnvironment(level) {
  return level !== "unit";
}

export function levelRuns(rows) {
  return CASE_LEVELS.map((level) => {
    const inLevel = rows.filter((r) => r.level === level);
    return {
      level,
      total: inLevel.length,
      todo: inLevel.filter((r) => r.status === "todo").length,
      needsEnvironment: needsEnvironment(level),
    };
  }).filter((run) => run.total > 0);
}

export function currentLevel(rows) {
  return rows.find((r) => r.status === "todo")?.level ?? null;
}

export function levelFinished(rows, level) {
  return !rows.some((r) => r.level === level && r.status === "todo");
}
