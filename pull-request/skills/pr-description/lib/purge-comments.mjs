// 前回までにこのスキルが投稿した行コメントを消し、レビュー本体を非表示にする。
// 投稿済みのレビュー自体は GitHub の仕組みで消せないため、非表示で代える。
// 消した行コメントに付いた返信は GitHub 側で残る。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COMMENT_MARKER } from "./comment-marker.mjs";

// 印を付ける前に投稿されたものを見分けるための旧来の手掛かり。
const NUMBERED_RE = /^\d+:/;
const LEGACY_REVIEW_TEXT = "番号順に読んでください";

const MINIMIZE_QUERY =
  "mutation($id: ID!) { minimizeComment(input: {subjectId: $id, classifier: OUTDATED}) { minimizedComment { isMinimized } } }";

export function isSkillComment(body) {
  return body.includes(COMMENT_MARKER) || NUMBERED_RE.test(body);
}

export function isSkillReview(body) {
  return body.includes(COMMENT_MARKER) || body.includes(LEGACY_REVIEW_TEXT);
}

export function planPurge({ login, comments, reviews }) {
  const own = (x) => x.user && x.user.login === login;
  return {
    deleteIds: comments.filter((c) => own(c) && isSkillComment(c.body ?? "")).map((c) => c.id),
    hideNodeIds: reviews
      .filter((r) => own(r) && r.state !== "PENDING" && isSkillReview(r.body ?? ""))
      .map((r) => r.node_id),
  };
}

function errorReason(e) {
  const stderr = e && e.stderr != null ? e.stderr.toString().trim() : "";
  return stderr !== "" ? stderr : String(e && e.message ? e.message : e);
}

const EMPTY = { deleted: 0, hidden: 0, failed: 0, failures: [] };

export function run({ pr, gh }) {
  if (typeof pr !== "string" || !/^\d+$/.test(pr)) {
    return { ok: false, ...EMPTY, reason: `invalid --pr: ${pr}` };
  }
  let plan;
  try {
    // --jq で文字列を取り出すと引用符なしの素の文字列が返る。
    const login = gh(["api", "user", "--jq", ".login"]).trim();
    const list = (path) => JSON.parse(gh(["api", "--paginate", "--slurp", path])).flat();
    plan = planPurge({
      login,
      comments: list(`repos/{owner}/{repo}/pulls/${pr}/comments`),
      reviews: list(`repos/{owner}/{repo}/pulls/${pr}/reviews`),
    });
  } catch (e) {
    return { ok: false, ...EMPTY, reason: errorReason(e) };
  }
  const failures = [];
  let deleted = 0;
  for (const id of plan.deleteIds) {
    try {
      gh(["api", "-X", "DELETE", `repos/{owner}/{repo}/pulls/comments/${id}`]);
      deleted++;
    } catch (e) {
      failures.push({ kind: "delete", id, reason: errorReason(e) });
    }
  }
  let hidden = 0;
  for (const id of plan.hideNodeIds) {
    try {
      gh(["api", "graphql", "-f", `query=${MINIMIZE_QUERY}`, "-f", `id=${id}`]);
      hidden++;
    } catch (e) {
      failures.push({ kind: "hide", id, reason: errorReason(e) });
    }
  }
  return { ok: true, deleted, hidden, failed: failures.length, failures };
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const pr = argValue(argv, "--pr");
  const out = argValue(argv, "--out");
  if (!pr || !out) {
    console.error("usage: purge-comments.mjs --pr <number> --out <path>");
    process.exit(1);
  }
  // 行コメントの一覧は diff の断片を含み大きくなる。既定の 1MB だと取得に失敗し、何も消さずに投稿だけが進む。
  const gh = (args) =>
    execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  // 消せなくても投稿は止めない。結果は JSON で報告に回す。
  let result;
  try {
    result = run({ pr, gh });
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
