import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { maskProtected } from "./strip-decoration.mjs";

const INNER_DETAILS_RE = /<details\b[^>]*>(?:(?!<details\b)[\s\S])*?<\/details>/i;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const LIST_RE = /^[ \t　]*(?:[-*+・･－‐―–—][ \t　]*\S|\d+[.)][ \t　]+\S)/m;
const FILENAME_RE = /[\w.\-/]+\.(mjs|cjs|js|jsx|ts|tsx|json|md|py|go|rb|rs|java|kt|swift|php|c|h|cpp|hpp|css|scss|html|vue|sql|xml|yml|yaml|toml|ini|cfg|sh|txt|lock)\b/;
const FILENAME_ALL_RE = new RegExp(FILENAME_RE.source, "g");
const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const URL_RE = /\bhttps?:\/\/\S+/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const CALL_RE = /\b[A-Za-z_][A-Za-z0-9_]*\(\)/g;
const DOTTED_RE = /\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b/g;
const SNAKE_RE = /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g;
const CAMEL_RE = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;

export function loadPolicy(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function extractOpenPart(body) {
  let text = body.replace(HTML_COMMENT_RE, "");
  let prev;
  do {
    prev = text;
    text = text.replace(INNER_DETAILS_RE, "");
  } while (text !== prev);
  return text;
}

// 句点だけでなく改行も文の境界として数える。句点を打たない体言止めの羅列を
// 1 文として通さないため。
export function countSentences(text) {
  return text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

// 識別子の走査対象から外すもの。コードは散文ではなく、URL とファイルパスは
// 読めば分かる。文字位置を保つため同じ長さの空白に置き換える。
const blank = (m) => " ".repeat(m.length);

export function stripNoise(text) {
  return text
    .replace(CODE_FENCE_RE, blank)
    .replace(HTML_COMMENT_RE, blank)
    .replace(URL_RE, blank)
    .replace(FILENAME_ALL_RE, blank);
}

// 日本語の文中の丸括弧を、形だけで拾う。意味は見ない。例外に当たるかどうかは
// Phase 5 の問い 14 が判定する。鉤括弧の中身は対象に含める。ルール文の
// 「鉤括弧は対象外」は鉤括弧という記号を禁止しないという意味で、手順書には
// 出力する文字列を鉤括弧で引用している箇所があるため。
const PAREN_RE = /（[^）\n]*）|\([^)\n]*\)/g;

// Markdown リンクの飛び先も URL なので、丸括弧を探す前に空白へ置き換える。
// `](飛び先)` の形だけを潰し、ラベル側は残す。ラベルの中の丸括弧は本文の
// 丸括弧なので拾う。飛び先が入れ子の丸括弧を持つときは最初の `)` までしか
// 潰せないが、閉じ丸括弧だけが残っても PAREN_RE はマッチしない。
const MD_LINK_RE = /\]\([^)\n]*\)/g;

// 丸括弧を探すときだけ使う URL の隠し方。stripNoise の URL_RE は空白以外を
// すべて飲むので、空白を置かない日本語の文章では URL の後ろが行末まで消える。
// ここでは URL を空白と全角の丸括弧と日本語の文字で止める。半角の丸括弧は
// 止めないので、URL の内側の丸括弧は今までどおり隠れる。
const PAREN_URL_RE = /\bhttps?:\/\/[^\s（）\u3000-\u30ff\u4e00-\u9fff]+/g;

// 丸括弧を探すための前処理。URL の隠し方だけ PAREN_URL_RE に替え、ほかは
// stripNoise と同じにする。
const stripNoiseForParens = (text) =>
  text
    .replace(CODE_FENCE_RE, blank)
    .replace(HTML_COMMENT_RE, blank)
    .replace(PAREN_URL_RE, blank)
    .replace(FILENAME_ALL_RE, blank);

export function extractParens(text) {
  // 除外の判定は空白化した文字列で行うが、返す文字列は元の文字列から同じ位置で
  // 切り出す。空白化は文字数を変えないので位置は一致する。中身が物理名や
  // ファイル名だけの丸括弧はルールが認める唯一の例外なので、中身が見えないと
  // Phase 5 の問い 14 が例外かどうかを判定できない。
  const clean = stripNoiseForParens(text).replace(MD_LINK_RE, blank).replace(INLINE_CODE_RE, blank);
  const out = [];
  for (const m of clean.matchAll(PAREN_RE)) {
    out.push(text.slice(m.index, m.index + m[0].length));
  }
  return out;
}

// 形だけでコード内の名前と言い切れる語を、出現順・重複排除・許可語除外で返す。
// 意味は見ない。大文字始まりの英単語 1 語（Vendor）は PR/AI/DB と形が同じなので
// ここでは取らず、Phase 5 の問い 6 に回す。
export function extractIdentifiers(text, policy) {
  const allow = new Set(policy["識別子の許可語"] ?? []);
  const clean = stripNoise(text);
  const hits = [];
  for (const m of clean.matchAll(INLINE_CODE_RE)) {
    hits.push({ at: m.index, token: m[1].trim() });
  }
  const bare = clean.replace(INLINE_CODE_RE, blank);
  for (const re of [CALL_RE, DOTTED_RE, SNAKE_RE, CAMEL_RE]) {
    for (const m of bare.matchAll(re)) {
      hits.push({ at: m.index, token: m[0] });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out = [];
  for (const { token } of hits) {
    if (token === "" || allow.has(token)) continue;
    if (out.includes(token)) continue;
    // 抑制するのは同じ実体の別表記だけ。applyFallback() と applyFallback、
    // Vendor.enabled_features と enabled_features のような親子関係に限る。
    // 単なる部分文字列（some_user_service と user_service）は別の識別子なので残す。
    if (out.some((kept) => kept === `${token}()` || kept.endsWith(`.${token}`) || kept.startsWith(`${token}.`))) continue;
    out.push(token);
  }
  return out;
}

// summary と details の中身、行コメントから初出だけを集める。展開部分は
// checkStructure が違反として見るのでここには入れない。summary は畳んだ状態で
// 見える行なので、details の中身と分けて where を振る。
export function collectIdentifiers({ body, lineComments = [] }, policy) {
  const out = [];
  const seen = new Set();
  const add = (where, tokens) => {
    for (const token of tokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push({ where, token });
    }
  };
  // 番号は内側から外側へ食う順に振る。入れ子があると文書の出現順とは一致しない。
  let n = 0;
  let text = body;
  let prev;
  do {
    prev = text;
    text = text.replace(INNER_DETAILS_BLOCK_RE, (_m, inner) => {
      n += 1;
      const summary = SUMMARY_RE.exec(inner);
      if (summary !== null) {
        add(`summary ${n}`, extractIdentifiers(summary[1], policy));
      }
      add(`details ${n}`, extractIdentifiers(inner.replace(SUMMARY_RE, ""), policy));
      return " ";
    });
  } while (text !== prev);
  lineComments.forEach((c, i) => {
    add(`行コメント ${i + 1}`, extractIdentifiers(commentText(c), policy));
  });
  return out;
}

// 丸括弧は 1 つずつ直す対象なので、初出に絞らず出現ごとに全部載せる。
// 展開部分は checkStructure が違反として見るのでここには入れない。
export function collectParens({ body, lineComments = [] }) {
  const out = [];
  const add = (where, tokens) => {
    for (const token of tokens) out.push({ where, token });
  };
  // 番号は内側から外側へ食う順に振る。入れ子があると文書の出現順とは一致しない。
  let n = 0;
  let text = body;
  let prev;
  do {
    prev = text;
    text = text.replace(INNER_DETAILS_BLOCK_RE, (_m, inner) => {
      n += 1;
      const summary = SUMMARY_RE.exec(inner);
      if (summary !== null) {
        add(`summary ${n}`, extractParens(summary[1]));
      }
      add(`details ${n}`, extractParens(inner.replace(SUMMARY_RE, "")));
      return " ";
    });
  } while (text !== prev);
  lineComments.forEach((c, i) => {
    add(`行コメント ${i + 1}`, extractParens(commentText(c)));
  });
  return out;
}

export function checkStructure(body, policy) {
  const open = extractOpenPart(body);
  const violations = [];

  const sentences = countSentences(open);
  if (sentences > policy["展開部分の最大文数"]) {
    violations.push({
      rule: "展開部分の最大文数",
      detail: `${sentences} 文ある。上限は ${policy["展開部分の最大文数"]} 文`,
    });
  }

  if (policy["展開部分に箇条書きを禁止"] && LIST_RE.test(open)) {
    violations.push({ rule: "展開部分に箇条書きを禁止", detail: "展開部分に箇条書き記号がある" });
  }

  if (policy["展開部分にファイル名を禁止"]) {
    const hit = FILENAME_RE.exec(open);
    if (hit !== null) {
      violations.push({ rule: "展開部分にファイル名を禁止", detail: `"${hit[0]}" がある` });
    }
  }

  if (policy["展開部分に識別子を禁止"]) {
    const tokens = extractIdentifiers(open, policy);
    if (tokens.length > 0) {
      // 違反は 1 件のままにする（loop-decide.mjs が件数を数えるため）。
      // 語は全部 detail に並べる。1 語しか出さないと残りが次の周回まで見えず、
      // 上限まで直し漏れに気づけない。
      violations.push({
        rule: "展開部分に識別子を禁止",
        detail: `${tokens.map((t) => `"${t}"`).join("、")} がある`,
      });
    }
  }

  if (policy["展開部分に丸括弧を禁止"]) {
    const parens = extractParens(open);
    if (parens.length > 0) {
      // 識別子と同じく違反は 1 件にまとめる。丸括弧は全部 detail に並べる。
      violations.push({
        rule: "展開部分に丸括弧を禁止",
        detail: `${parens.map((t) => `"${t}"`).join("、")} がある`,
      });
    }
  }

  return violations;
}

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const BOLD_ANY_RE = /\*\*[^*\n]+\*\*|__[^_\n]+__/;
// 内側の details ブロック（中に別の details を含まないもの）だけにマッチする
const INNER_DETAILS_BLOCK_RE = /<details\b[^>]*>((?:(?!<details\b)[\s\S])*?)<\/details>/gi;
const SUMMARY_RE = /<summary[^>]*>([\s\S]*?)<\/summary>/i;
const NUMBERED_RE = /^\d+:/;
const NOISE_RE = /[\s、。「」『』（）()【】・,.:;!?"'`]/g;

export function checkVocabulary(text, policy) {
  const violations = [];
  for (const [category, words] of Object.entries(policy["禁止語"])) {
    for (const word of words) {
      if (text.includes(word)) {
        violations.push({ rule: "禁止語", detail: `${category}: "${word}"` });
      }
    }
  }
  if (policy["絵文字を全面禁止"] && EMOJI_RE.test(maskProtected(text))) {
    violations.push({ rule: "絵文字を全面禁止", detail: "絵文字がある" });
  }
  if (policy["太字を全面禁止"] && BOLD_ANY_RE.test(maskProtected(text))) {
    violations.push({ rule: "太字を全面禁止", detail: "太字がある" });
  }
  return violations;
}

// 未来の予定と書き手の評価・提案を語で見つける。禁止語と同じ部分一致だが、
// 分類が骨格（直らなければ投稿しない）なので、検査する 1 つの文につき
// 違反を 1 件にまとめ、detail に語を全部並べる。1 文に 2 語あるだけで
// 周回を 2 つ食わないようにするため。
// policy["禁止表現"] を持たない policy を渡す既存テストがあるので ?? {} で受ける。
export function checkBannedExpressions(text, policy) {
  const found = [];
  for (const [category, words] of Object.entries(policy["禁止表現"] ?? {})) {
    for (const word of words) {
      if (text.includes(word)) found.push({ category, word });
    }
  }
  if (found.length === 0) return [];
  const byCategory = new Map();
  for (const { category, word } of found) {
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(`"${word}"`);
  }
  const detail = [...byCategory].map(([category, words]) => `${category}: ${words.join("、")}`).join(" / ");
  return [{ rule: "禁止表現", detail }];
}

// 内側から外側へ 1 ブロックずつ検査する。外側の開始タグから内側の閉じタグまでを
// 1 ブロックとして食う非貪欲マッチだと、入れ子の内側が検査されないため。
// 検査済みの内側は本文だけを残して置き換える（外側の文字数に内側の散文を数えるため）。
export function checkDetails(body, policy) {
  const min = policy["detailsの中身の最小文字数"];
  const violations = [];
  let text = body;
  let prev;
  do {
    prev = text;
    text = text.replace(INNER_DETAILS_BLOCK_RE, (_m, inner) => {
      const content = inner.replace(SUMMARY_RE, "");
      const dense = content.replace(NOISE_RE, "");
      if (dense.length < min) {
        violations.push({
          rule: "detailsの中身の最小文字数",
          detail: `中身が ${dense.length} 文字しかない。下限は ${min} 文字`,
        });
      }
      return content;
    });
  } while (text !== prev);
  return violations;
}

export function iterDetails(body) {
  const blocks = [];
  let text = body;
  let prev;
  do {
    prev = text;
    text = text.replace(INNER_DETAILS_BLOCK_RE, (_m, inner) => {
      const summary = SUMMARY_RE.exec(inner);
      const title = summary !== null ? summary[1].trim() : "";
      const content = inner.replace(SUMMARY_RE, "");
      blocks.push({ title, content });
      return " ";
    });
  } while (text !== prev);
  return blocks;
}

function listItems(content) {
  const items = [];
  for (const line of content.split("\n")) {
    const m = /^( *)- (.*)$/.exec(line.replaceAll("\t", "  "));
    if (m === null) continue;
    items.push({ level: Math.floor(m[1].length / 2) + 1, text: m[2] });
  }
  return items;
}

export function checkBodySections(body, policy) {
  const reserved = new Set(policy["予約タイトル"] ?? []);
  const required = policy["必須detailsタイトル"] ?? [];
  const structured = new Set(policy["構造化箇条書きのタイトル"] ?? []);
  const l1ByteExempt = new Set(policy["1段階目バイト制限の除外"] ?? []);
  const banned = policy["禁止detailsタイトル"] ?? [];
  const maxL1 = policy["1段階目の最大バイト数"];
  const maxBytes = policy["detailsの中身の最大バイト数"];
  const maxExtra = policy["任意枠の最大個数"];
  const maxExtraBytes = policy["任意枠の最大バイト数"];
  const violations = [];
  const blocks = iterDetails(body);

  for (const title of required) {
    if (!blocks.some((b) => b.title === title)) {
      violations.push({ rule: "必須detailsタイトル", detail: `"${title}" が無い` });
    }
  }

  const extras = blocks.filter((b) => b.title !== "" && !reserved.has(b.title));
  if (typeof maxExtra === "number" && extras.length > maxExtra) {
    violations.push({
      rule: "任意枠の最大個数",
      detail: `${extras.length} 個ある。上限は ${maxExtra} 個`,
    });
  }

  for (const b of blocks) {
    for (const word of banned) {
      if (b.title.includes(word)) {
        violations.push({
          rule: "禁止detailsタイトル",
          detail: `"${b.title}" に "${word}" がある`,
        });
      }
    }

    const isExtra = b.title !== "" && !reserved.has(b.title);
    if (structured.has(b.title) && typeof maxBytes === "number") {
      const n = Buffer.byteLength(b.content, "utf8");
      if (n > maxBytes) {
        violations.push({
          rule: "detailsの中身の最大バイト数",
          detail: `"${b.title}" が ${n} バイト。上限は ${maxBytes} バイト`,
        });
      }
    }
    // 任意枠は共通の上限に掛けない。掛けると長すぎる任意枠に軽い違反と重い違反が二重に出る。
    if (isExtra && typeof maxExtraBytes === "number") {
      const n = Buffer.byteLength(b.content, "utf8");
      if (n > maxExtraBytes) {
        violations.push({
          rule: "任意枠の最大バイト数",
          detail: `"${b.title}" が ${n} バイト。上限は ${maxExtraBytes} バイト`,
        });
      }
    }

    const items = listItems(b.content);

    if (!l1ByteExempt.has(b.title) && typeof maxL1 === "number") {
      for (let i = 0; i < items.length; i++) {
        if (items[i].level !== 1) continue;
        const next = items[i + 1];
        if (!next || next.level !== 2) continue;
        const n = Buffer.byteLength(items[i].text, "utf8");
        if (n > maxL1) {
          violations.push({
            rule: "1段階目の最大バイト数",
            detail: `"${items[i].text}" が ${n} バイト。上限は ${maxL1} バイト`,
          });
        }
      }
    }

    if (!structured.has(b.title)) continue;

    if (items.length === 0) {
      violations.push({ rule: "構造化箇条書きが無い", detail: `"${b.title}" に箇条書きが無い` });
      continue;
    }
    if (items.some((it) => it.level >= 4)) {
      violations.push({ rule: "構造化箇条書きの段", detail: `"${b.title}" に 4 段階目がある` });
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].level !== 1) continue;
      const next = items[i + 1];
      if (!next || next.level !== 2) {
        violations.push({
          rule: "1段階目に2段階目が無い",
          detail: `"${b.title}" の "${items[i].text}" に 2 段階目が無い`,
        });
      }
    }
  }

  return violations;
}

// 行コメントは line-comments.json のオブジェクト（{path, line, numbered, text}）を
// そのまま受ける。文字列の配列も後方互換で受ける。
export function commentText(c) {
  if (typeof c === "string") return c;
  return typeof c?.text === "string" ? c.text : "";
}

// オブジェクトなら numbered フラグを信じる。文字列のときだけ書式から推定する。
function isNumberedComment(c) {
  if (typeof c === "string") return NUMBERED_RE.test(c.trim());
  return c?.numbered === true;
}

export function checkLineComments(comments, policy) {
  if (!policy["番号コメントは1行"]) return [];
  const violations = [];
  for (const c of comments) {
    const text = commentText(c).trim();
    if (isNumberedComment(c) && text.includes("\n")) {
      violations.push({ rule: "番号コメントは1行", detail: `"${text.split("\n")[0]}" が複数行` });
    }
  }
  return violations;
}

export function checkGeneratedFileComments(comments, generatedFiles) {
  const generated = new Set(generatedFiles);
  return comments
    .filter((c) => typeof c === "object" && generated.has(c?.path))
    .map((c) => ({
      rule: "生成ファイルへの行コメント",
      detail: `${c.path}:${c.line} に付いている。生成ファイルには行コメントを付けない`,
    }));
}

export function checkTitle(title, policy) {
  const violations = [];
  violations.push(...checkVocabulary(title, policy));
  violations.push(...checkBannedExpressions(title, policy));
  const max = policy["PRタイトルの最大文字数"];
  if (typeof max === "number") {
    const len = Array.from(title).length;
    if (len > max) {
      violations.push({
        rule: "PRタイトルの最大文字数",
        detail: `${len} 文字ある。上限は ${max} 文字`,
      });
    }
  }
  return violations;
}

// 装飾は消しても文が成立するので機械が消す（ループにも投稿ゲートにも数えない）。
// 骨格は「枠があるのに中身がない」「必須の枠が欠けている」系で、残ったら投稿しない。
// 言い換えは残っていても読めるので、上限に達しても投稿する。
export const RULE_KINDS = {
  "絵文字を全面禁止": "装飾",
  "太字を全面禁止": "装飾",
  "必須detailsタイトル": "骨格",
  "detailsの中身の最小文字数": "骨格",
  "構造化箇条書きが無い": "骨格",
  "1段階目に2段階目が無い": "骨格",
  "禁止detailsタイトル": "骨格",
  "禁止表現": "骨格",
  "生成ファイルへの行コメント": "骨格",
  "任意枠の最大個数": "骨格",
  "任意枠の最大バイト数": "骨格",
  "禁止語": "言い換え",
  "展開部分の最大文数": "言い換え",
  "展開部分に箇条書きを禁止": "言い換え",
  "展開部分にファイル名を禁止": "言い換え",
  "展開部分に識別子を禁止": "言い換え",
  "展開部分に丸括弧を禁止": "言い換え",
  "detailsの中身の最大バイト数": "言い換え",
  "1段階目の最大バイト数": "言い換え",
  "構造化箇条書きの段": "言い換え",
  "番号コメントは1行": "言い換え",
  "PRタイトルの最大文字数": "言い換え",
};

// 分類漏れを黙って通さない。新しいルールを足したら表にも足す。
export function classifyRule(rule) {
  const kind = RULE_KINDS[rule];
  if (kind === undefined) {
    throw new Error(`slop-check: 分類されていないルールです: ${rule}`);
  }
  return kind;
}

export function checkAll({ body, lineComments = [], title, generatedFiles = [] }, policy) {
  const violations = [
    ...checkStructure(body, policy),
    ...checkVocabulary(body, policy),
    ...checkBannedExpressions(body, policy),
    ...checkDetails(body, policy),
    ...checkBodySections(body, policy),
    ...checkLineComments(lineComments, policy),
    ...checkGeneratedFileComments(lineComments, generatedFiles),
  ];
  for (const c of lineComments) {
    violations.push(...checkVocabulary(commentText(c), policy));
    violations.push(...checkBannedExpressions(commentText(c), policy));
  }
  if (typeof title === "string") {
    violations.push(...checkTitle(title, policy));
  }
  return {
    violations: violations.map((v) => ({ ...v, kind: classifyRule(v.rule) })),
    identifiers: collectIdentifiers({ body, lineComments }, policy),
    parens: collectParens({ body, lineComments }),
  };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function readGeneratedFiles(path) {
  if (!path) throw new Error("--generated-file が無い");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === "string")) {
    throw new Error(`${path} が文字列の配列でない`);
  }
  return parsed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const bodyFile = argValue(argv, "--body-file");
  const policyPath = argValue(argv, "--policy");
  if (!bodyFile || !policyPath) {
    console.error("usage: slop-check.mjs --body-file <path> [--comments-file <path>] [--title-file <path>] --generated-file <path> --policy <path>");
    process.exit(1);
  }
  let generatedFiles;
  try {
    generatedFiles = readGeneratedFiles(argValue(argv, "--generated-file"));
  } catch (e) {
    console.error(`slop-check: 生成ファイル一覧を読めない: ${e.message}`);
    process.exit(1);
  }
  const commentsFile = argValue(argv, "--comments-file");
  const titleFile = argValue(argv, "--title-file");
  const lineComments = commentsFile ? JSON.parse(readFileSync(commentsFile, "utf8")) : [];
  const title = titleFile ? readFileSync(titleFile, "utf8").trim() : undefined;
  const result = checkAll(
    { body: readFileSync(bodyFile, "utf8"), lineComments, title, generatedFiles },
    loadPolicy(policyPath),
  );
  console.log(JSON.stringify(result));
}
