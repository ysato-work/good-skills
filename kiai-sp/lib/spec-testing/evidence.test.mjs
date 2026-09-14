import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caseLogBytes, renderCommands, truncateLog, writeLog } from "./evidence.mjs";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "spec-testing-evidence-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("上限以下のログはそのまま返す", () => {
  const r = truncateLog("short", { maxBytes: 100, keepBytes: 10 });
  assert.equal(r.text, "short");
  assert.equal(r.truncated, false);
  assert.equal(r.omittedBytes, 0);
});

test("上限を超えたら先頭と末尾を残して中間を省略する", () => {
  const text = `${"a".repeat(50)}${"b".repeat(50)}`;
  const r = truncateLog(text, { maxBytes: 40, keepBytes: 10 });
  assert.equal(r.truncated, true);
  assert.ok(r.text.startsWith("aaaaaaaaaa"));
  assert.ok(r.text.endsWith("bbbbbbbbbb"));
  assert.match(r.text, /中略: 80 バイト省略/);
});

test("省略はマルチバイト文字の途中で切らない", () => {
  // あ は UTF-8 で 3 バイト。keepBytes が 3 の倍数でない位置で切らせる
  const text = "あ".repeat(100);
  const r = truncateLog(text, { maxBytes: 30, keepBytes: 10 });
  assert.equal(r.truncated, true);
  assert.equal(r.text.includes("�"), false, "文字化けが混ざっている");
  assert.ok(r.text.startsWith("あああ"));
  assert.ok(r.text.endsWith("あああ"));
});

test("caseLogBytes はディレクトリが無ければ 0", () => {
  withDir((dir) => {
    assert.equal(caseLogBytes(join(dir, "T-999")), 0);
  });
});

test("caseLogBytes は .log だけを数える", () => {
  withDir((dir) => {
    writeFileSync(join(dir, "1-a.log"), "12345", "utf8");
    writeFileSync(join(dir, "commands.md"), "無視される", "utf8");
    assert.equal(caseLogBytes(dir), 5);
  });
});

test("writeLog はログを書いてパスを返す", () => {
  withDir((dir) => {
    const target = join(dir, "T-001");
    const r = writeLog(target, "1-npm-test.log", "ok", { totalMaxBytes: 1000 });
    assert.equal(r.written, true);
    assert.equal(readFileSync(r.path, "utf8"), "ok");
  });
});

test("writeLog は 1 ケースの合計上限に達したら書かない", () => {
  withDir((dir) => {
    const target = join(dir, "T-001");
    writeLog(target, "1-a.log", "x".repeat(20), { totalMaxBytes: 20 });
    const second = writeLog(target, "2-b.log", "y".repeat(20), { totalMaxBytes: 20 });
    assert.equal(second.written, false);
    assert.equal(second.capReached, true);
    assert.equal(second.path, null);
  });
});

test("writeLog は書いた結果として上限に達したら capReached を立てる", () => {
  withDir((dir) => {
    const target = join(dir, "T-001");
    const r = writeLog(target, "1-a.log", "x".repeat(20), { totalMaxBytes: 20 });
    assert.equal(r.written, true);
    assert.equal(r.capReached, true);
  });
});

test("renderCommands はコマンドと終了コードとログ名を並べる", () => {
  const md = renderCommands("T-001", [
    { command: "npm test", exitCode: 0, logFile: "1-npm-test.log" },
    { command: "node bin/x", exitCode: 1, logFile: "2-node-bin-x.log" },
  ]);
  assert.match(md, /^# T-001 実行コマンド$/m);
  assert.match(md, /\| 1 \| `npm test` \| 0 \| `1-npm-test\.log` \|/);
  assert.match(md, /\| 2 \| `node bin\/x` \| 1 \| `2-node-bin-x\.log` \|/);
});

test("renderCommands は上限到達を本文に残す", () => {
  const md = renderCommands("T-001", [{ command: "a", exitCode: 0, logFile: null }], {
    capReached: true,
  });
  assert.match(md, /ログ合計上限に達した/);
  assert.match(md, /\(記録なし\)/);
});

test("renderCommands はコマンド中のパイプが表を壊さない", () => {
  const md = renderCommands("T-001", [
    { command: "cat a | grep b", exitCode: 0, logFile: "1-cat-a-grep-b.log" },
  ]);
  assert.equal(md.includes("cat a | grep b"), false);
  assert.match(md, /cat a \\\| grep b/);
});
