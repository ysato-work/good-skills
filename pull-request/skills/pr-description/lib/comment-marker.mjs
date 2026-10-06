// 投稿したコメントを次の実行で見分けるための印。HTML コメントなので GitHub の画面には出ない。
// line-comments.json には入れない。入れると表層検査と各エージェントに印が渡るため。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const COMMENT_MARKER = "<!-- pr-desc:comment -->";

export function stampComments(lineComments) {
  return lineComments.map((c) => ({
    path: c.path,
    line: c.line,
    body: `${c.text.replace(/\s+$/, "")}\n\n${COMMENT_MARKER}`,
  }));
}

export function buildReviewBody(lineComments) {
  const n = lineComments.filter((c) => c.numbered).length;
  return n > 0 ? `1 から ${n} の番号順に読んでください。\n\n${COMMENT_MARKER}` : COMMENT_MARKER;
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const input = argValue(argv, "--in");
  const out = argValue(argv, "--out");
  if (!input || !out) {
    console.error("usage: comment-marker.mjs --in <line-comments.json> --out <line-comments-post.json>");
    process.exit(1);
  }
  let comments;
  try {
    comments = JSON.parse(readFileSync(input, "utf8"));
  } catch (e) {
    console.error(`入力を読めない: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(comments)) {
    console.error("入力が配列ではない");
    process.exit(1);
  }
  const result = { review_body: buildReviewBody(comments), comments: stampComments(comments) };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
}
