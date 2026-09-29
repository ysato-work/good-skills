import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CODE_FENCE_SRC = "```[\\s\\S]*?```|~~~[\\s\\S]*?~~~";
const INLINE_CODE_SRC = "`[^`\\n]*`";
// URL の中の下線を太字記号と誤認しない（GitHub は自動リンクの中で強調を適用しない）。
// `\S+` は終端が無く、日本語の句読点や `**` まで一続きに飲み込んでしまう
// （その結果、URL の直後に続く装飾が検出も除去もされなくなる）。URL に実際に
// 使われる文字だけを陽に許可し、それ以外（全角の句読点・絵文字・`*` など）に
// 当たった時点で止まるようにする。`_` は許可に含める（パス中の `__init__` を
// 保護対象のままにするため。C-1 のテストが確かめている）。
const URL_SRC = "https?:\\/\\/[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()+,;=%]+";
const EMOJI_RE = /\p{Extended_Pictographic}[\u{FE0E}\u{FE0F}]?/gu;
// 異体字セレクタと ZWJ は文字コードで書く。不可視文字を直書きすると読めない。
const ZWJ_RE = /\u{200D}/gu;
const BOLD_STAR_RE = /\*\*([^*\n]+)\*\*/g;
const BOLD_UNDER_RE = /__([^_\n]+)__/g;
const TRAILING_WS_RE = /[ \t　]+$/gm;

// 保護範囲（コードフェンス・インラインコード・URL）の位置を、重なりを畳んで返す。
function protectedSpans(text) {
  const spans = [];
  for (const src of [CODE_FENCE_SRC, INLINE_CODE_SRC, URL_SRC]) {
    for (const m of text.matchAll(new RegExp(src, "g"))) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && s[0] < last[1]) {
      last[1] = Math.max(last[1], s[1]);
      continue;
    }
    merged.push([s[0], s[1]]);
  }
  return merged;
}

// コードは散文ではないので、装飾の検出も除去もその外側だけでやる。
// 文字位置を保つため同じ長さの空白に置き換える。
export function maskProtected(text) {
  let out = "";
  let pos = 0;
  for (const [start, end] of protectedSpans(text)) {
    out += text.slice(pos, start);
    out += " ".repeat(end - start);
    pos = end;
  }
  return out + text.slice(pos);
}

function mapUnprotected(text, fn) {
  let out = "";
  let pos = 0;
  for (const [start, end] of protectedSpans(text)) {
    out += fn(text.slice(pos, start));
    out += text.slice(start, end);
    pos = end;
  }
  return out + fn(text.slice(pos));
}

// 絵文字と太字は消しても文が成立する。読者に見えていたものは変わらないので
// 情報が失われない。だから検出して直させるのではなく機械が消す。
export function stripDecoration(text, policy) {
  let emoji = 0;
  let bold = 0;
  const out = mapUnprotected(text, (seg) => {
    let s = seg;
    if (policy["絵文字を全面禁止"]) {
      let segmentEmoji = 0;
      s = s
        .replace(EMOJI_RE, () => {
          emoji += 1;
          segmentEmoji += 1;
          return "";
        })
        .replace(ZWJ_RE, "");
      // この区間で実際に絵文字が消えたなら、この区間だけ行末空白を除去する
      if (segmentEmoji > 0) s = s.replace(TRAILING_WS_RE, "");
    }
    if (policy["太字を全面禁止"]) {
      s = s.replace(BOLD_STAR_RE, (_m, inner) => {
        bold += 1;
        return inner;
      });
      s = s.replace(BOLD_UNDER_RE, (_m, inner) => {
        bold += 1;
        return inner;
      });
    }
    return s;
  });
  return { text: out, emoji, bold };
}

export function stripAll({ body, lineComments = [], title }, policy) {
  const counts = { emoji: 0, bold: 0 };
  const run = (text) => {
    const r = stripDecoration(text, policy);
    counts.emoji += r.emoji;
    counts.bold += r.bold;
    return r.text;
  };
  const outBody = run(body);
  const outComments = lineComments.map((c) => {
    if (typeof c === "string") return run(c);
    return { ...c, text: run(typeof c?.text === "string" ? c.text : "") };
  });
  const outTitle = typeof title === "string" ? run(title) : undefined;
  return { body: outBody, lineComments: outComments, title: outTitle, counts };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const bodyFile = argValue(argv, "--body-file");
  const policyPath = argValue(argv, "--policy");
  if (!bodyFile || !policyPath) {
    console.error(
      "usage: strip-decoration.mjs --body-file <path> [--comments-file <path>] [--title-file <path>] --policy <path>",
    );
    process.exit(1);
  }
  const commentsFile = argValue(argv, "--comments-file");
  const titleFile = argValue(argv, "--title-file");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const lineComments = commentsFile ? JSON.parse(readFileSync(commentsFile, "utf8")) : [];
  const title = titleFile ? readFileSync(titleFile, "utf8").trim() : undefined;
  const r = stripAll({ body: readFileSync(bodyFile, "utf8"), lineComments, title }, policy);
  writeFileSync(bodyFile, r.body);
  if (commentsFile) writeFileSync(commentsFile, `${JSON.stringify(r.lineComments, null, 2)}\n`);
  if (titleFile) writeFileSync(titleFile, r.title);
  console.log(JSON.stringify(r.counts));
}
