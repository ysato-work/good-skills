import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildFrameIndex, validateFrames, frameKey } from "./filter-tone.mjs";

export function validateShape(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.findings)) {
    throw new Error("圧縮担当の出力に findings 配列がありません");
  }
  return parsed.findings;
}

// 前周回に門を通った指摘のファイルから引用だけを抜き出す。決着の種類（直した／理由付きで
// 残した）で区別しない。直した引用は本文から消えていて門 1 で落ちるので、区別しても
// 結果が変わらない。区別しないことで台帳を読む必要が無くなる。
//
// 門の出力（{kept, dropped, counts}）と圧縮担当の生の出力（{findings}）の両方を受ける。
// 門 3 に渡すのは前者（前周回に門を通った指摘のファイル）。設計が「渡す一覧と門が
// 捨てる対象が必ず一致する」ことを求めているため、抜き出し元は門の出力に揃える。
export function extractQuotes(parsed) {
  const findings = Array.isArray(parsed?.kept) ? parsed.kept : validateShape(parsed);
  const seen = new Set();
  for (const f of findings) {
    const q = typeof f?.quote === "string" ? f.quote.trim() : "";
    if (q !== "") seen.add(q);
  }
  return [...seen];
}

// 文字数は書記素ではなくコードポイントで数える。サロゲートペアを 2 文字と数えると
// 絵文字を含む引用で「短くなっていない」の判定がぶれるため。
function length(s) {
  return [...s].length;
}

// 門 1（捏造の検出）→ 門 2（圧縮になっていない提案）→ 門 3（周回を跨いだラチェット）の
// 順に当てる。門 1 を先に置くのは、引用が実在しない指摘に対して他の門の判定が
// 意味を持たないため。
export function filterFindings(findings, frames, noTouch = []) {
  const frameIndex = buildFrameIndex(frames);
  const blocked = new Set(noTouch);
  const kept = [];
  const dropped = [];
  for (const f of findings) {
    const quote = typeof f?.quote === "string" ? f.quote.trim() : "";
    const shorter = typeof f?.shorter === "string" ? f.shorter.trim() : "";
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
    if (shorter === "" || length(shorter) >= length(quote)) {
      dropped.push({ finding: f, why: "縮めた案が元より短くない" });
      continue;
    }
    if (blocked.has(quote)) {
      dropped.push({ finding: f, why: "前周回に門を通った引用" });
      continue;
    }
    kept.push(f);
  }
  const gate1 = dropped.filter((d) => d.why === "引用が無い" || d.why === "指摘が名指しする枠が入力に無い" || d.why === "引用が本文に無い").length;
  const gate2 = dropped.filter((d) => d.why === "縮めた案が元より短くない").length;
  const gate3 = dropped.filter((d) => d.why === "前周回に門を通った引用").length;
  return { kept, dropped, counts: { kept: kept.length, gate1, gate2, gate3 } };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

const USAGE = [
  "usage:",
  "  filter-compress.mjs --findings-file <path> --input-file <path> [--no-touch-file <path>]",
  "  filter-compress.mjs --extract-quotes <path>",
].join("\n");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const extractFrom = argValue(argv, "--extract-quotes");
  try {
    if (extractFrom) {
      console.log(JSON.stringify(extractQuotes(JSON.parse(readFileSync(extractFrom, "utf8")))));
    } else {
      const findingsFile = argValue(argv, "--findings-file");
      const inputFile = argValue(argv, "--input-file");
      const noTouchFile = argValue(argv, "--no-touch-file");
      if (!findingsFile || !inputFile) {
        console.error(USAGE);
        process.exit(1);
      }
      const findings = validateShape(JSON.parse(readFileSync(findingsFile, "utf8")));
      const frames = validateFrames(JSON.parse(readFileSync(inputFile, "utf8")));
      const noTouch = noTouchFile ? JSON.parse(readFileSync(noTouchFile, "utf8")) : [];
      if (!Array.isArray(noTouch)) {
        throw new Error("触るな一覧のファイルが配列ではありません");
      }
      console.log(JSON.stringify(filterFindings(findings, frames, noTouch)));
    }
  } catch (err) {
    console.error(`filter-compress: ${err.message}`);
    process.exit(1);
  }
}
