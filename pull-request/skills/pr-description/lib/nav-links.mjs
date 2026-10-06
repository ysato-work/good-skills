// 番号コメントは投稿して初めて ID が決まる。本文を作る時点では隣の ID が分からないので、
// 投稿後に取り直して末尾にリンク行を足す。line-comments.json にはリンク行を入れない。
// 入れると「番号コメントは1行」の検査と各エージェントに余計な行が渡るため。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NUMBER_RE = /^(\d+):/;
// 末尾の段落がリンク行かを、要素ごとに見て判定する。正規表現 1 本にしないのは、
// 数字だけの段落で終わる本文をリンク行と取り違えないため。リンクが 1 つも無ければ本文とみなす。
const NAV_LINK_RE = /^\[(?:◀|▶|◀前|次▶|\d+)\]\([^)\s]+\)$/;
const BARE_NUMBER_RE = /^\d+$/;

// 取り直した後は numbered フラグが無いので、Phase 7 の前回分削除と同じく本文の先頭で見分ける。
export function parseNumber(body) {
  const m = NUMBER_RE.exec(body);
  return m ? Number(m[1]) : null;
}

export function stripNavTail(body) {
  const trimmed = body.replace(/\s+$/, "");
  const i = trimmed.lastIndexOf("\n\n");
  if (i === -1) return trimmed;
  const tokens = trimmed.slice(i + 2).split(" ");
  const isNav =
    tokens.every((t) => NAV_LINK_RE.test(t) || BARE_NUMBER_RE.test(t)) && tokens.some((t) => NAV_LINK_RE.test(t));
  return isNav ? trimmed.slice(0, i).replace(/\s+$/, "") : trimmed;
}

export function commentUrl({ owner, repo, pr, id }) {
  return `https://github.com/${owner}/${repo}/pull/${pr}/changes#r${id}`;
}

export function buildNavLine({ owner, repo, pr, ids, index }) {
  if (ids.length < 2) return "";
  const link = (label, id) => `[${label}](${commentUrl({ owner, repo, pr, id })})`;
  const parts = [];
  if (index > 0) parts.push(link("◀", ids[index - 1]));
  ids.forEach((id, i) => parts.push(i === index ? String(i + 1) : link(String(i + 1), id)));
  if (index < ids.length - 1) parts.push(link("▶", ids[index + 1]));
  return parts.join(" ");
}

export function planEdits({ owner, repo, pr, comments }) {
  const numbered = comments
    .map((c) => ({ ...c, n: parseNumber(c.body) }))
    .filter((c) => c.n !== null)
    .sort((a, b) => a.n - b.n);
  if (numbered.length < 2) return [];
  const ids = numbered.map((c) => c.id);
  return numbered.map((c, index) => {
    const nav = buildNavLine({ owner, repo, pr, ids, index });
    return { id: c.id, body: `${stripNavTail(c.body)}\n\n${nav}` };
  });
}

export function summarize({ planned, results }) {
  const linked = results.filter((r) => r.ok).length;
  const failures = results.filter((r) => !r.ok).map((r) => ({ id: r.id, reason: r.reason }));
  return { total: planned, linked, failed: planned - linked, failures };
}

function errorReason(e) {
  const stderr = e && e.stderr != null ? e.stderr.toString().trim() : "";
  return stderr !== "" ? stderr : String(e && e.message ? e.message : e);
}

// review ID が取れない経路では、実行者自身の最も新しい review を今回のものとみなす。
// 投稿の直後に呼ぶ前提なので、これが今回投稿した review になる。
function findOwnLatestReview({ pr, gh }) {
  // --jq で文字列を取り出すと引用符なしの素の文字列が返る。
  const login = gh(["api", "user", "--jq", ".login"]).trim();
  const reviews = JSON.parse(gh(["api", "--paginate", "--slurp", `repos/{owner}/{repo}/pulls/${pr}/reviews`])).flat();
  const own = reviews
    .filter((r) => r.user && r.user.login === login && r.submitted_at && r.state !== "PENDING")
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
  return own.length > 0 ? String(own[0].id) : null;
}

const EMPTY = { total: 0, linked: 0, failed: 0, failures: [] };

export function run({ pr, reviewId, gh }) {
  if (typeof pr !== "string" || !/^\d+$/.test(pr)) {
    return { ok: false, ...EMPTY, reason: `invalid --pr: ${pr}` };
  }
  let owner;
  let repo;
  let comments;
  try {
    ({ owner, repo } = JSON.parse(gh(["api", "repos/{owner}/{repo}", "--jq", "{owner: .owner.login, repo: .name}"])));
    // 空文字も「渡されていない」とみなす。review-id.txt が空のまま渡る場合に備える。
    const id = reviewId ? reviewId : findOwnLatestReview({ pr, gh });
    if (id === null) return { ok: false, ...EMPTY, reason: "実行者自身の review が見つからない" };
    comments = JSON.parse(
      gh(["api", "--paginate", "--slurp", `repos/{owner}/{repo}/pulls/${pr}/reviews/${id}/comments`]),
    ).flat();
  } catch (e) {
    return { ok: false, ...EMPTY, reason: errorReason(e) };
  }
  const edits = planEdits({ owner, repo, pr, comments: comments.map((c) => ({ id: c.id, body: c.body })) });
  const results = edits.map((e) => {
    try {
      gh(["api", "-X", "PATCH", `repos/{owner}/{repo}/pulls/comments/${e.id}`, "-f", `body=${e.body}`]);
      return { id: e.id, ok: true };
    } catch (err) {
      return { id: e.id, ok: false, reason: errorReason(err) };
    }
  });
  return { ok: true, ...summarize({ planned: edits.length, results }) };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const pr = argValue(argv, "--pr");
  const reviewId = argValue(argv, "--review");
  const out = argValue(argv, "--out");
  if (!pr || !out) {
    console.error("usage: nav-links.mjs --pr <number> [--review <id>] --out <path>");
    process.exit(1);
  }
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  // 投稿は済んでいるので、ここで失敗しても投稿を止めない。結果は JSON で報告に回す。
  let result;
  try {
    result = run({ pr, reviewId, gh });
  } catch (e) {
    result = { ok: false, ...EMPTY, reason: errorReason(e) };
  }
  const json = JSON.stringify(result, null, 2);
  try {
    writeFileSync(out, `${json}\n`);
  } catch {
    // 書けなくても標準出力で報告する。
  }
  console.log(json);
}
