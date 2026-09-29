import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AI_LIKE = "AIっぽい";
const NOT_AI_LIKE_WHY = "AI っぽくないと判定された";

export function validateShape(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.findings)) {
    throw new Error("判定役の出力に findings 配列がありません");
  }
  return parsed.findings;
}

// frames-iter-<N>.json（判定役に渡した枠の配列）を kind+title で引ける形にする。
export function validateFrames(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error("判定対象の枠の入力ファイルが配列ではありません");
  }
  return parsed;
}

// kind と title の組を一意なキーにする。title には自由記述（任意枠のタイトル）が
// 入るので、区切り文字での連結ではなく JSON でエンコードして衝突を避ける。
export function frameKey(kind, title) {
  return JSON.stringify([kind ?? "", title ?? ""]);
}

// キー（kind+title）1 つに対してテキストの配列を持つ。番号コメント・意図コメントは
// それぞれ複数枠あり得るが、どちらも title を持たない（判定役の定義がそう定めている）
// ので、同じ kind+title を共有する枠が複数になるのは普通の状態。Map.set の後勝ちで
// 1 件に畳んでしまうと、複数ある枠のうち最後の 1 つ以外の引用が全部「引用が本文に
// 無い」という偽の理由で捨てられる（枠 A の引用が枠 B にしかない、という本来の
// 捏造検出とは別物）。
export function buildFrameIndex(frames) {
  const index = new Map();
  for (const f of frames) {
    const key = frameKey(f?.kind, f?.title);
    const text = typeof f?.text === "string" ? f.text : "";
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(text);
  }
  return index;
}

// 引用が無い指摘、指摘が名指しする枠が入力に無い指摘、引用がその枠の中に実在しない
// 指摘を捨てる。「全体的に機械的」で枠ごと書き直させないため、捏造の見逃しを防ぐため、
// そして枠 A から取った引用が偶然枠 B に出現して間違った枠を直しに行かせないため。
//
// frames は判定役に渡したのと同じ枠の配列（各要素が {kind, title, text}）。
// 引用は指摘が名指しする枠（kind と title の組）と同じ組を持つ、いずれかの枠の
// text の中にあれば通す。別の組（別の kind・別の title）の枠にだけ出現しても
// 通さない。
export function filterFindings(findings, frames) {
  const frameIndex = buildFrameIndex(frames);
  const kept = [];
  const dropped = [];
  for (const f of findings) {
    if (f?.verdict !== AI_LIKE) {
      dropped.push({ finding: f, why: NOT_AI_LIKE_WHY });
      continue;
    }
    const quote = typeof f.quote === "string" ? f.quote.trim() : "";
    if (quote === "") {
      dropped.push({ finding: f, why: "引用が無い" });
      continue;
    }
    const key = frameKey(f?.kind, f?.title);
    if (!frameIndex.has(key)) {
      dropped.push({ finding: f, why: "指摘が名指しする枠が入力に無い" });
      continue;
    }
    if (!frameIndex.get(key).some((text) => text.includes(quote))) {
      dropped.push({ finding: f, why: "引用が本文に無い" });
      continue;
    }
    kept.push(f);
  }
  const notAiLike = dropped.filter((d) => d.why === NOT_AI_LIKE_WHY).length;
  return {
    kept,
    dropped,
    // dropped は引用の門（引用が無い／枠が無い／引用が本文に無い）で捨てた件数だけを
    // 数える。「AI っぽくない」という判定そのものは門の効き具合とは別物なので混ぜない。
    counts: { kept: kept.length, not_ai_like: notAiLike, dropped: dropped.length - notAiLike },
  };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const findingsFile = argValue(argv, "--findings-file");
  const inputFile = argValue(argv, "--input-file");
  if (!findingsFile || !inputFile) {
    console.error("usage: filter-tone.mjs --findings-file <path> --input-file <path>");
    process.exit(1);
  }
  try {
    const findings = validateShape(JSON.parse(readFileSync(findingsFile, "utf8")));
    const frames = validateFrames(JSON.parse(readFileSync(inputFile, "utf8")));
    console.log(JSON.stringify(filterFindings(findings, frames)));
  } catch (err) {
    console.error(`filter-tone: ${err.message}`);
    process.exit(1);
  }
}
