import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

/**
 * 読む transcript を 1 本だけ決める。複数を結合しない。
 *
 * 今いるセッションの ID で名指しする。更新時刻が最新のものを選ばない。
 * 複数のセッションが同時に立っているとき、最新が自分の記録とは限らず、
 * 別のセッションの記録を自分のものとして読むことになるため。
 */
export function resolveTranscriptPath({ cwd, home, explicit, sessionId, env = process.env } = {}) {
  if (explicit) return explicit;
  const id = sessionId ?? env?.CLAUDE_CODE_SESSION_ID;
  if (!id) {
    throw new Error("no session id: set CLAUDE_CODE_SESSION_ID or pass --file");
  }
  const dirName = (cwd ?? process.cwd()).replace(/\//g, "-");
  const path = join(home ?? homedir(), ".claude", "projects", dirName, `${id}.jsonl`);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`no transcript for session ${id}: ${path}`);
  }
  if (!stat.isFile()) throw new Error(`no transcript for session ${id}: ${path}`);
  return path;
}

/** 人間の発話ではないもの。取り違えるとこのスキルが生まれた事故と同じ形になる。 */
const SYSTEM_PREFIX = /^\s*<(task-notification|system-reminder|local-command)/;

function textOf(message) {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.filter((x) => x?.type === "text").map((x) => x.text ?? "").join("");
  }
  return "";
}

export function readEntries(filePath) {
  const out = [];
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const text = textOf(o.message);
    if (!text.trim()) continue;
    if (o.type === "user") {
      if (o.isMeta) continue;
      if (o.isCompactSummary || o.isVisibleInTranscriptOnly) continue;
      if (SYSTEM_PREFIX.test(text)) continue;
      out.push({ role: "human", timestamp: o.timestamp, text });
    } else if (o.type === "assistant") {
      out.push({ role: "assistant", timestamp: o.timestamp, text });
    }
  }
  return out;
}

/**
 * 絞り込んだうえで、末尾から offset 件飛ばした手前の limit 件を返す。
 * 呼び出し側が続きの有無を当てずっぽうで判断しなくて済むよう、件数の内訳も返す。
 */
export function selectEntries(entries, { role = "human", match, limit = 5, offset = 0, since, until } = {}) {
  let r = entries;
  if (role !== "all") r = r.filter((e) => e.role === role);
  if (since) r = r.filter((e) => e.timestamp >= since);
  if (until) r = r.filter((e) => e.timestamp <= until);
  if (match) {
    const re = new RegExp(match, "i");
    r = r.filter((e) => re.test(e.text));
  }
  const total = r.length;
  const end = Math.max(0, total - offset);
  const start = limit > 0 ? Math.max(0, end - limit) : 0;
  return { entries: r.slice(start, end), total, offset, limit, hasMore: start > 0 };
}

const ROLES = ["human", "assistant", "all"];

export function parseArgs(argv) {
  const o = { role: "human", limit: 5, offset: 0, json: false, full: false };

  function requireValue(flag, index) {
    if (index >= argv.length || argv[index].startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return argv[index];
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--full") o.full = true;
    else if (a === "--role") o.role = requireValue("--role", ++i);
    else if (a === "--match") o.match = requireValue("--match", ++i);
    else if (a === "--limit") o.limit = Number(requireValue("--limit", ++i));
    else if (a === "--offset") o.offset = Number(requireValue("--offset", ++i));
    else if (a === "--since") o.since = requireValue("--since", ++i);
    else if (a === "--until") o.until = requireValue("--until", ++i);
    else if (a === "--file") o.file = requireValue("--file", ++i);
    else throw new Error(`unknown option: ${a}`);
  }
  if (!ROLES.includes(o.role)) throw new Error(`--role must be one of ${ROLES.join(", ")}`);
  if (!Number.isFinite(o.limit)) throw new Error("--limit must be a number");
  if (!Number.isFinite(o.offset) || o.offset < 0) {
    throw new Error("--offset must be a number of 0 or more");
  }
  return o;
}

export function formatText(transcript, page, { full = false } = {}) {
  const head = [
    `# transcript: ${transcript}`,
    `# 全 ${page.total} 件中 ${page.entries.length} 件（offset ${page.offset}）。続き: ${page.hasMore ? "あり" : "なし"}`,
  ];
  const body = page.entries.map((e) => {
    const text = full ? e.text : e.text.replace(/\s+/g, " ").slice(0, 120);
    return `${e.timestamp}  ${e.role}  ${text}`;
  });
  return [...head, ...body].join("\n");
}

export function formatJson(transcript, page) {
  return JSON.stringify({ transcript, ...page }, null, 2);
}

export function run(argv, { cwd, home, env } = {}) {
  const o = parseArgs(argv);
  const path = resolveTranscriptPath({ cwd, home, env, explicit: o.file });
  const page = selectEntries(readEntries(path), o);
  return o.json ? formatJson(path, page) : formatText(path, page, { full: o.full });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  }
}
