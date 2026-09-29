import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 本気モードだけ 4 にしているのは、語り口の判定と圧縮の検査が 1〜2 周目に入って
// 検査対象が増えるため。元の 3 の根拠は「検査対象が本文 1 つと行コメント数本だけ」
// だった。前半だけの軸を 2 周目まで延ばしても上限は上げない（設計で決めた）。
export const MAX_ITER = { light: 3, serious: 4 };

const LEDGER_RE = /^iter-\d+\.json$/;

function requireFinite(name, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`loop-decide: ${name} は有限な数値である必要があります（受け取った値: ${value}）`);
  }
}

export function decide({
  iter,
  mode,
  skeleton,
  reword,
  review_findings,
  tone_rewrites = 0,
  compress_unresolved = 0,
  compress_applied = 0,
}) {
  requireFinite("iter", iter);
  requireFinite("skeleton", skeleton);
  requireFinite("reword", reword);
  requireFinite("review_findings", review_findings);
  requireFinite("tone_rewrites", tone_rewrites);
  requireFinite("compress_unresolved", compress_unresolved);
  requireFinite("compress_applied", compress_applied);

  const max = MAX_ITER[mode];
  if (max === undefined) {
    throw new Error(`loop-decide: mode は light か serious である必要があります（受け取った値: ${mode}）`);
  }

  // 装飾の違反は数えない（機械が消すため）。語り口の指摘の残りも数えない
  // （keep を認めていないため）。圧縮の未決着は数える（構造指摘と同じ決着なので）。
  const remaining = skeleton + reword + review_findings + compress_unresolved;

  // 語り口の書き直しをした周回と、圧縮を反映した周回の後は、その文を表層検査と
  // 14 問にもう 1 回通すために続行を強制する。どちらも前半だけの軸なので、
  // この強制が効くのも本気モードの 1〜2 周目の後だけ。
  if (remaining === 0 && tone_rewrites === 0 && compress_applied === 0) {
    return { action: "STOP", publish: true, reason: "clean" };
  }
  if (iter >= max) {
    // 言い換えが残った本文は読める。骨格が欠けた本文と未決着の指摘は出さない。
    const publish = skeleton === 0 && review_findings === 0;
    return {
      action: "STOP",
      publish,
      reason: publish ? "max_iter_reached_publishable" : "max_iter_reached",
    };
  }
  return { action: "CONTINUE", publish: false, reason: "has_findings" };
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`loop-decide: ${label}がありません: ${path}`);
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`loop-decide: ${label}の JSON パースに失敗しました: ${path}: ${err.message}`);
  }
}

/**
 * 判定材料を WORKDIR のファイルから集める。親が手で書いた数値は使わない。
 * - iter: 今回の実行 ID の台帳ディレクトリにある iter-<N>.json の個数
 * - mode: WORKDIR 直下の level.txt（"light" | "serious"）
 * - skeleton / reword: 台帳ディレクトリ内の slop-iter-<iter>.json の violations を
 *   kind（Task 2 で付与）別に数えた件数。装飾（機械が消すため）は数えない
 * - review_findings: 台帳 iter-<iter>.json の review_findings
 * - tone_rewrites: 台帳 iter-<iter>.json の tone.rewritten（無ければ 0）
 * - compress_unresolved: 台帳 iter-<iter>.json の compress.unresolved（無ければ 0）
 * - compress_applied: 台帳 iter-<iter>.json の compress.applied（無ければ 0）
 */
export function collect(workdir) {
  const runIdPath = join(workdir, "run-id");
  let runId;
  try {
    runId = readFileSync(runIdPath, "utf8").trim();
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`loop-decide: 実行 ID のファイルがありません: ${runIdPath}`);
    }
    throw err;
  }
  if (runId === "") {
    throw new Error(`loop-decide: 実行 ID のファイルが空です: ${runIdPath}`);
  }

  const ledgerDir = join(workdir, "ledger", runId);
  let names;
  try {
    names = readdirSync(ledgerDir);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`loop-decide: 台帳ディレクトリがありません: ${ledgerDir}`);
    }
    throw err;
  }
  const iter = names.filter((n) => LEDGER_RE.test(n)).length;
  if (iter === 0) {
    throw new Error(`loop-decide: 台帳ファイル（iter-<N>.json）が 1 つもありません: ${ledgerDir}`);
  }

  const slopPath = join(ledgerDir, `slop-iter-${iter}.json`);
  const slop = readJson(slopPath, "表層検出の出力");
  if (!Array.isArray(slop.violations)) {
    throw new Error(`loop-decide: 表層検出の出力に violations 配列がありません: ${slopPath}`);
  }
  for (const v of slop.violations) {
    if (typeof v?.kind !== "string") {
      throw new Error(`loop-decide: 表層検出の違反に分類（kind）がありません: ${slopPath}`);
    }
  }

  const ledgerPath = join(ledgerDir, `iter-${iter}.json`);
  const ledger = readJson(ledgerPath, "台帳");

  // tone.unresolved は「keep を認めていないので 0 でなければならない」と
  // phase-6.md が主張しているだけで、これまで強制されていなかった。値が
  // 明示的に書かれていて 0 以外なら、語り口の指摘を直さず残す規律が破られた
  // ことなのでここで止める。キー自体が無い（tone を書いていない周回）場合は
  // 対象外。
  if (ledger.tone !== undefined && ledger.tone !== null) {
    const unresolved = ledger.tone.unresolved;
    if (unresolved !== undefined && unresolved !== 0) {
      throw new Error(
        `loop-decide: 台帳の tone.unresolved が 0 ではありません（受け取った値: ${unresolved}）: ${ledgerPath}`,
      );
    }
  }

  const levelPath = join(workdir, "level.txt");
  let mode;
  try {
    mode = readFileSync(levelPath, "utf8").trim();
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`loop-decide: モードのファイルがありません: ${levelPath}`);
    }
    throw err;
  }

  return {
    iter,
    mode,
    skeleton: slop.violations.filter((v) => v.kind === "骨格").length,
    reword: slop.violations.filter((v) => v.kind === "言い換え").length,
    review_findings: ledger.review_findings,
    tone_rewrites: ledger.tone?.rewritten ?? 0,
    // 圧縮を走らせていない周回は台帳に compress キー自体が無い（規約）。
    // 前周回の値を写せてしまうと、反映が 0 件の周回でも続行の強制が効き続けて
    // 上限まで無駄に回るため、キーの有無で 0 に落とす。
    compress_unresolved: ledger.compress?.unresolved ?? 0,
    compress_applied: ledger.compress?.applied ?? 0,
  };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workdir = argValue(process.argv.slice(2), "--workdir");
  if (!workdir) {
    console.error("usage: loop-decide.mjs --workdir <path>");
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(decide(collect(workdir))));
  } catch (err) {
    if (err.message && err.message.startsWith("loop-decide:")) {
      console.error(err.message);
    } else {
      console.error(`loop-decide: エラー: ${err.message}`);
    }
    process.exit(1);
  }
}
