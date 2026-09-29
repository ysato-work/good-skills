import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MARKER_RE = /^<!--\s*pr-desc:\s*sha=([0-9a-f]{6,64})(?:\s+last-ai-edit=([^\s>]+))?\s*-->$/;

export function normalizeBody(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""));
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

export function computeSha(text) {
  return createHash("sha256").update(normalizeBody(text), "utf8").digest("hex").slice(0, 12);
}

const BEGIN_RE = /^<!--\s*pr-desc:begin\s*-->$/;

export const BEGIN_MARKER = "<!-- pr-desc:begin -->";

export function stripMarker(text) {
  const kept = normalizeBody(text)
    .split("\n")
    .filter((line) => !MARKER_RE.test(line) && !BEGIN_RE.test(line));
  return normalizeBody(kept.join("\n"));
}

// 囲みの上の末尾にある区切り線を落とす。組み立て側が毎回置き直すので、
// 残したままだと実行のたびに区切り線が増える。
function dropTrailingSeparator(lines) {
  const out = lines.slice();
  const popBlanks = () => {
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  };
  popBlanks();
  if (out.length > 0 && /^(-{3,}|\*{3,}|_{3,})$/.test(out[out.length - 1].trim())) {
    out.pop();
    popBlanks();
  }
  return out;
}

// 囲みの下の先頭にある空行を落とす。マーカー行の直後に投稿先が空行を挟んで
// 署名を足すことがあり、残したままだと below の中身が空行から始まってしまう。
function dropLeadingBlank(lines) {
  const out = lines.slice();
  while (out.length > 0 && out[0].trim() === "") out.shift();
  return out;
}

function joinOrEmpty(lines) {
  const text = lines.join("\n");
  return text.trim() === "" ? "" : normalizeBody(text);
}

// 開始の印が無く終了の印だけある本文は、旧い形として「囲みの上が無く、
// 全部が囲みの中」とみなす。運用中の PR がこの形で残っている。
function cut(lines, begin, end) {
  const above = begin === -1 ? [] : dropTrailingSeparator(lines.slice(0, begin));
  const inside = lines.slice(begin === -1 ? 0 : begin + 1, end);
  const below = end >= lines.length ? [] : dropLeadingBlank(lines.slice(end + 1));
  return { above: joinOrEmpty(above), inside: joinOrEmpty(inside), below: joinOrEmpty(below) };
}

export function splitBody(text) {
  const lines = normalizeBody(text).split("\n");
  const begins = [];
  const ends = [];
  lines.forEach((line, i) => {
    if (BEGIN_RE.test(line)) begins.push(i);
    else if (MARKER_RE.test(line)) ends.push(i);
  });

  if (begins.length === 0 && ends.length === 0) {
    return { state: "no_marker", above: joinOrEmpty(lines), inside: "", below: "", last_ai_edit: null, broken: false };
  }

  // 印の数が合わない・順序が逆の本文は、囲みの上と下を正しく切り出せない。
  // 内容が印と合わないだけの不一致（上下は切り出せる）と区別するため、
  // この判定を broken として呼び出し側に返す。
  const broken =
    begins.length > 1 ||
    ends.length > 1 ||
    ends.length === 0 ||
    (begins.length === 1 && begins[0] > ends[0]);

  const begin = begins.length > 0 ? begins[0] : -1;
  const end = ends.length > 0 ? ends[ends.length - 1] : lines.length;
  const parts = cut(lines, begin, end);

  // 終了の印から読めた日時は、一致しなかった場合も保持する。人に聞くときに
  // 「スキルが最後に書いたのはいつか」を言えると判断しやすい。
  const match = end < lines.length ? MARKER_RE.exec(lines[end]) : null;
  const at = match === null || match[2] === undefined ? null : match[2];

  if (broken) {
    return { state: "mismatch", ...parts, last_ai_edit: at, broken: true };
  }

  const matches = computeSha(parts.inside) === match[1];
  return {
    state: matches ? "matches" : "mismatch",
    ...parts,
    last_ai_edit: at,
    broken: false,
  };
}

export function checkBody(text) {
  const r = splitBody(text);
  return {
    has_marker: r.state !== "no_marker",
    sha_matches: r.state === "matches",
    last_ai_edit: r.last_ai_edit,
  };
}

export function composeBody(above, inside, below, isoTime) {
  const head = above.trim() === "" ? "" : `${normalizeBody(above)}\n---\n\n`;
  const body = normalizeBody(inside);
  const tail = below.trim() === "" ? "" : normalizeBody(below);
  const marker = `<!-- pr-desc: sha=${computeSha(body)} last-ai-edit=${isoTime} -->`;
  return `${head}${BEGIN_MARKER}\n${body}${marker}\n${tail}`;
}

export function stampBody(text, isoTime) {
  return composeBody("", stripMarker(text), "", isoTime);
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const bodyFile = argValue(argv, "--body-file");
  if (!bodyFile) {
    console.error("usage: body-marker.mjs <check|state|stamp|compose> --body-file <path> [--new-body-file <path>] [--at <iso>] [--overwrite]");
    process.exit(1);
  }
  const at = argValue(argv, "--at") || new Date().toISOString();
  const isOverwriteCompose = cmd === "compose" && argv.includes("--overwrite");
  const body = isOverwriteCompose ? undefined : readFileSync(bodyFile, "utf8");
  if (cmd === "check") {
    console.log(JSON.stringify(checkBody(body)));
  } else if (cmd === "state") {
    const r = splitBody(body);
    console.log(JSON.stringify({
      state: r.state,
      last_ai_edit: r.last_ai_edit,
      broken: r.broken,
      has_above: r.above !== "",
      has_below: r.below !== "",
    }));
  } else if (cmd === "stamp") {
    process.stdout.write(stampBody(body, at));
  } else if (cmd === "compose") {
    const newBodyFile = argValue(argv, "--new-body-file");
    if (!newBodyFile) {
      console.error("compose requires --new-body-file");
      process.exit(1);
    }
    const next = readFileSync(newBodyFile, "utf8");
    if (isOverwriteCompose) {
      process.stdout.write(composeBody("", next, "", at));
    } else {
      const r = splitBody(body);
      process.stdout.write(composeBody(r.above, next, r.below, at));
    }
  } else {
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
  }
}
