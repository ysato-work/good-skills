import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTranscriptPath, readEntries, selectEntries, parseArgs, formatText, formatJson, run } from "./transcript.mjs";

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), "kimoi-test-"));
  const dir = join(home, ".claude", "projects", "-home-user-dot-claude");
  mkdirSync(dir, { recursive: true });
  return { home, dir };
}

test("作業ディレクトリと環境変数のセッション ID から読む 1 本を決める", () => {
  const { home, dir } = makeHome();
  try {
    const mine = join(dir, "48ec8511-ef91-5bb5-9580-4b295a3292b7.jsonl");
    writeFileSync(mine, "");
    assert.equal(
      resolveTranscriptPath({
        cwd: "/home/user/dot-claude",
        home,
        env: { CLAUDE_CODE_SESSION_ID: "48ec8511-ef91-5bb5-9580-4b295a3292b7" },
      }),
      mine,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("別セッションのファイルが後から更新されていても、自分のセッションのものを返す", () => {
  const { home, dir } = makeHome();
  try {
    const mine = join(dir, "aaaaaaaa-0000-0000-0000-000000000000.jsonl");
    const other = join(dir, "bbbbbbbb-1111-1111-1111-111111111111.jsonl");
    writeFileSync(mine, "");
    writeFileSync(other, "");
    utimesSync(mine, new Date(1000000), new Date(1000000));
    utimesSync(other, new Date(2000000), new Date(2000000));

    assert.equal(
      resolveTranscriptPath({
        cwd: "/home/user/dot-claude",
        home,
        env: { CLAUDE_CODE_SESSION_ID: "aaaaaaaa-0000-0000-0000-000000000000" },
      }),
      mine,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("サブディレクトリに同じ名前があっても直下のものを返す", () => {
  const { home, dir } = makeHome();
  try {
    const id = "cccccccc-2222-2222-2222-222222222222";
    mkdirSync(join(dir, "subagents"), { recursive: true });
    writeFileSync(join(dir, "subagents", `${id}.jsonl`), "");
    const top = join(dir, `${id}.jsonl`);
    writeFileSync(top, "");

    assert.equal(
      resolveTranscriptPath({ cwd: "/home/user/dot-claude", home, sessionId: id }),
      top,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("explicit が渡されたらそれをそのまま返す", () => {
  assert.equal(
    resolveTranscriptPath({ explicit: "/tmp/given.jsonl", env: {} }),
    "/tmp/given.jsonl",
  );
});

test("セッション ID のファイルが無ければエラーを投げる", () => {
  const { home } = makeHome();
  try {
    assert.throws(
      () => resolveTranscriptPath({ cwd: "/home/user/dot-claude", home, sessionId: "dddddddd" }),
      /no transcript for session dddddddd/,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("セッション ID もファイル指定も無ければ、推測で選ばずエラーを投げる", () => {
  const { home, dir } = makeHome();
  try {
    writeFileSync(join(dir, "eeeeeeee.jsonl"), "");
    assert.throws(
      () => resolveTranscriptPath({ cwd: "/home/user/dot-claude", home, env: {} }),
      /CLAUDE_CODE_SESSION_ID/,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

const FIXTURE = [
  // 人間の発話（content が文字列）
  { type: "user", timestamp: "2026-09-14T10:00:00.000Z", message: { content: "これは人間の発話" } },
  // 人間の発話（content が配列）
  { type: "user", timestamp: "2026-09-14T10:01:00.000Z", message: { content: [{ type: "text", text: "配列の発話" }] } },
  // 注入された内容（isMeta）
  { type: "user", isMeta: true, timestamp: "2026-09-14T10:02:00.000Z", message: { content: "スキルの注入本文" } },
  // コンパクト要約（人間の発話ではない）
  { type: "user", isCompactSummary: true, isVisibleInTranscriptOnly: true, timestamp: "2026-09-14T10:02:30.000Z", message: { content: "This session is being continued from a previous conversation" } },
  // タスク完了通知
  { type: "user", timestamp: "2026-09-14T10:03:00.000Z", message: { content: "<task-notification>\n終わった\n</task-notification>" } },
  // system-reminder
  { type: "user", timestamp: "2026-09-14T10:04:00.000Z", message: { content: "  <system-reminder>気をつけて</system-reminder>" } },
  // スラッシュコマンドの出力
  { type: "user", timestamp: "2026-09-14T10:05:00.000Z", message: { content: "<local-command-stdout>結果</local-command-stdout>" } },
  // ツール実行結果
  { type: "user", timestamp: "2026-09-14T10:06:00.000Z", message: { content: [{ type: "tool_result", content: "ツールの出力" }] } },
  // assistant の発話（thinking は混ぜない）
  { type: "assistant", timestamp: "2026-09-14T10:07:00.000Z", message: { content: [{ type: "thinking", thinking: "内心" }, { type: "text", text: "AI の発話" }] } },
  // 空白だけ
  { type: "user", timestamp: "2026-09-14T10:08:00.000Z", message: { content: "   " } },
  // スラッシュコマンドの起動（人間がやったこと。後ろに本人の言葉が続く）
  { type: "user", timestamp: "2026-09-14T10:09:00.000Z", message: { content: "<command-name>/recap</command-name>\n手前の話に戻る" } },
];

function writeFixture() {
  const home = mkdtempSync(join(tmpdir(), "kimoi-fix-"));
  const file = join(home, "session.jsonl");
  const lines = FIXTURE.map((o) => JSON.stringify(o));
  lines.splice(3, 0, "");          // 空行
  lines.splice(5, 0, "{ 壊れた JSON");  // パースできない行
  writeFileSync(file, lines.join("\n") + "\n");
  return { home, file };
}

test("人間の発話とシステム由来のものを取り違えない", () => {
  const { home, file } = writeFixture();
  try {
    const entries = readEntries(file);
    const humans = entries.filter((e) => e.role === "human").map((e) => e.text);
    assert.deepEqual(humans, [
      "これは人間の発話",
      "配列の発話",
      "<command-name>/recap</command-name>\n手前の話に戻る",
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("assistant の発話は text だけを取り、thinking を含めない", () => {
  const { home, file } = writeFixture();
  try {
    const entries = readEntries(file);
    const ai = entries.filter((e) => e.role === "assistant");
    assert.equal(ai.length, 1);
    assert.equal(ai[0].text, "AI の発話");
    assert.equal(ai[0].timestamp, "2026-09-14T10:07:00.000Z");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("空行と壊れた行を飛ばして落ちない", () => {
  const { home, file } = writeFixture();
  try {
    assert.equal(readEntries(file).length, 4);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

const SAMPLE = [
  { role: "human", timestamp: "2026-09-14T10:00:00.000Z", text: "土台の話" },
  { role: "assistant", timestamp: "2026-09-14T10:01:00.000Z", text: "三つ目の話" },
  { role: "human", timestamp: "2026-09-14T10:02:00.000Z", text: "キモいという話" },
  { role: "human", timestamp: "2026-09-14T10:03:00.000Z", text: "土台をもう一度" },
  { role: "assistant", timestamp: "2026-09-14T10:04:00.000Z", text: "最後の AI 発話" },
];

test("既定では人間の発話だけを返す", () => {
  const r = selectEntries(SAMPLE, {});
  assert.deepEqual(r.entries.map((e) => e.text), ["土台の話", "キモいという話", "土台をもう一度"]);
});

test("role で assistant に絞り、limit 1 で直前の発話が取れる", () => {
  const r = selectEntries(SAMPLE, { role: "assistant", limit: 1 });
  assert.deepEqual(r.entries.map((e) => e.text), ["最後の AI 発話"]);
});

test("role all は両方返す", () => {
  assert.equal(selectEntries(SAMPLE, { role: "all", limit: 0 }).entries.length, 5);
});

test("match は大文字小文字を区別しない正規表現で絞る", () => {
  const r = selectEntries(SAMPLE, { role: "all", limit: 0, match: "土台|ai 発話" });
  assert.deepEqual(r.entries.map((e) => e.text), ["土台の話", "土台をもう一度", "最後の AI 発話"]);
});

test("limit は末尾から取る", () => {
  const r = selectEntries(SAMPLE, { limit: 2 });
  assert.deepEqual(r.entries.map((e) => e.text), ["キモいという話", "土台をもう一度"]);
});

test("limit 0 は全部返す", () => {
  assert.equal(selectEntries(SAMPLE, { limit: 0 }).entries.length, 3);
});

test("offset は末尾から飛ばして、その手前を返す", () => {
  const r = selectEntries(SAMPLE, { limit: 2, offset: 2 });
  assert.deepEqual(r.entries.map((e) => e.text), ["土台の話"]);
});

test("件数の内訳と続きの有無を返す", () => {
  const first = selectEntries(SAMPLE, { limit: 2 });
  assert.equal(first.total, 3);
  assert.equal(first.offset, 0);
  assert.equal(first.limit, 2);
  assert.equal(first.hasMore, true);

  const next = selectEntries(SAMPLE, { limit: 2, offset: 2 });
  assert.equal(next.total, 3);
  assert.equal(next.offset, 2);
  assert.equal(next.hasMore, false);
});

test("offset が総数を超えたら空を返し、続きは無しになる", () => {
  const r = selectEntries(SAMPLE, { limit: 2, offset: 99 });
  assert.deepEqual(r.entries, []);
  assert.equal(r.total, 3);
  assert.equal(r.hasMore, false);
});

test("limit 0 と offset を併せると、飛ばした残り全部を返す", () => {
  const r = selectEntries(SAMPLE, { limit: 0, offset: 1 });
  assert.deepEqual(r.entries.map((e) => e.text), ["土台の話", "キモいという話"]);
  assert.equal(r.hasMore, false);
});

test("since と until で時刻の範囲を絞る", () => {
  const r = selectEntries(SAMPLE, {
    role: "all",
    limit: 0,
    since: "2026-09-14T10:01:00.000Z",
    until: "2026-09-14T10:03:00.000Z",
  });
  assert.deepEqual(r.entries.map((e) => e.text), ["三つ目の話", "キモいという話", "土台をもう一度"]);
});

test("parseArgs の既定値", () => {
  assert.deepEqual(parseArgs([]), { role: "human", limit: 5, offset: 0, json: false, full: false });
});

test("parseArgs が全オプションを読む", () => {
  const o = parseArgs([
    "--role", "all",
    "--match", "土台",
    "--limit", "3",
    "--offset", "6",
    "--since", "2026-09-14T10:00:00.000Z",
    "--until", "2026-09-14T11:00:00.000Z",
    "--json",
    "--full",
    "--file", "/tmp/x.jsonl",
  ]);
  assert.deepEqual(o, {
    role: "all",
    match: "土台",
    limit: 3,
    offset: 6,
    since: "2026-09-14T10:00:00.000Z",
    until: "2026-09-14T11:00:00.000Z",
    json: true,
    full: true,
    file: "/tmp/x.jsonl",
  });
});

test("parseArgs は知らないオプションを拒む", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
});

test("parseArgs は負の offset を拒む", () => {
  assert.throws(() => parseArgs(["--offset", "-1"]), /--offset/);
  assert.throws(() => parseArgs(["--offset", "x"]), /--offset/);
});

test("parseArgs は role の値を検査する", () => {
  assert.throws(() => parseArgs(["--role", "bot"]), /--role/);
});

test("parseArgs は値がない場合にエラーを投げる", () => {
  assert.throws(() => parseArgs(["--match"]), /--match requires a value/);
  assert.throws(() => parseArgs(["--file"]), /--file requires a value/);
  assert.throws(() => parseArgs(["--since"]), /--since requires a value/);
  assert.throws(() => parseArgs(["--until"]), /--until requires a value/);
  assert.throws(() => parseArgs(["--role"]), /--role requires a value/);
  assert.throws(() => parseArgs(["--limit"]), /--limit requires a value/);
});

test("parseArgs は値の代わりにフラグが来ると拒む", () => {
  assert.throws(() => parseArgs(["--match", "--json"]), /--match requires a value/);
  assert.throws(() => parseArgs(["--file", "--role", "human"]), /--file requires a value/);
  assert.throws(() => parseArgs(["--limit", "--full"]), /--limit requires a value/);
  assert.throws(() => parseArgs(["--since", "--until", "2026-09-14T10:00:00.000Z"]), /--since requires a value/);
});

function page(entries, extra = {}) {
  return {
    entries,
    total: entries.length,
    offset: 0,
    limit: 0,
    hasMore: false,
    ...extra,
  };
}

test("formatText の 1 行目は読んだファイルのパス", () => {
  const out = formatText("/tmp/session.jsonl", page(SAMPLE.slice(0, 1)), {});
  assert.equal(out.split("\n")[0], "# transcript: /tmp/session.jsonl");
});

test("formatText の 2 行目に件数と続きの有無を出す", () => {
  const out = formatText("/tmp/session.jsonl", page(SAMPLE.slice(0, 1), { total: 9, offset: 3, limit: 1, hasMore: true }), {});
  const line = out.split("\n")[1];
  assert.match(line, /全 9 件/);
  assert.match(line, /offset 3/);
  assert.match(line, /続き: あり/);

  const last = formatText("/tmp/session.jsonl", page(SAMPLE.slice(0, 1)), {});
  assert.match(last.split("\n")[1], /続き: なし/);
});

test("formatText は既定で本文を潰して切る", () => {
  const long = [{ role: "human", timestamp: "2026-09-14T10:00:00.000Z", text: "あ\nい" + "う".repeat(200) }];
  const line = formatText("/tmp/x.jsonl", page(long), {}).split("\n")[2];
  assert.equal(line.includes("\n"), false);
  assert.equal(line, "2026-09-14T10:00:00.000Z  human  " + ("あ い" + "う".repeat(200)).slice(0, 120));
});

test("formatText の full は本文をそのまま出す", () => {
  const long = [{ role: "human", timestamp: "2026-09-14T10:00:00.000Z", text: "あ\nい" }];
  const out = formatText("/tmp/x.jsonl", page(long), { full: true });
  assert.equal(out.split("\n").slice(2).join("\n"), "2026-09-14T10:00:00.000Z  human  あ\nい");
});

test("formatJson は読んだファイルと本文の全文を含む", () => {
  const parsed = JSON.parse(formatJson("/tmp/session.jsonl", page(SAMPLE.slice(0, 1), { total: 9, offset: 3, limit: 1, hasMore: true })));
  assert.equal(parsed.transcript, "/tmp/session.jsonl");
  assert.deepEqual(parsed.entries, [SAMPLE[0]]);
  assert.equal(parsed.total, 9);
  assert.equal(parsed.offset, 3);
  assert.equal(parsed.hasMore, true);
});

test("run は --file のファイルを読み、JSON にパスと本文を入れる", () => {
  const { home, file } = writeFixture();
  try {
    const parsed = JSON.parse(run(["--file", file, "--json", "--limit", "0"]));
    assert.equal(parsed.transcript, file);
    assert.deepEqual(parsed.entries.map((e) => e.text), [
      "これは人間の発話",
      "配列の発話",
      "<command-name>/recap</command-name>\n手前の話に戻る",
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("run は --role all --limit 0 で人間と assistant の両方を返す（selectEntries に o をそのまま渡す）", () => {
  const { home, file } = writeFixture();
  try {
    const parsed = JSON.parse(run(["--file", file, "--json", "--role", "all", "--limit", "0"]));
    assert.equal(parsed.entries.length, 4);
    assert.equal(parsed.entries.filter((e) => e.role === "assistant").length, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("run はテキスト形式が既定で、--full を付けると本文を切らずに返す", () => {
  const { home, file } = writeFixture();
  try {
    const textOut = run(["--file", file, "--role", "assistant", "--limit", "0"]);
    assert.equal(textOut.split("\n")[0], `# transcript: ${file}`);
    const fullOut = run(["--file", file, "--role", "assistant", "--limit", "0", "--full"]);
    assert.equal(fullOut.split("\n").at(-1), "2026-09-14T10:07:00.000Z  assistant  AI の発話");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("run は --offset で続きを取れ、続きの有無を返す", () => {
  const { home, file } = writeFixture();
  try {
    const first = JSON.parse(run(["--file", file, "--json", "--limit", "2"]));
    assert.equal(first.total, 3);
    assert.equal(first.hasMore, true);
    const next = JSON.parse(run(["--file", file, "--json", "--limit", "2", "--offset", "2"]));
    assert.equal(next.hasMore, false);
    assert.equal(next.entries.length, 1);
    assert.equal(
      first.entries.some((e) => e.text === next.entries[0].text),
      false,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
