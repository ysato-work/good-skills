import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  EVIDENCE_ALLOWED_EXT,
  ROOT_ALLOWED,
  SCRIPT_EXTENSIONS,
  checkArtifacts,
  checkFile,
} from "./delivery-check.mjs";

const RW = 0o100644;
const RWX = 0o100755;

function reasonFor(rel, mode = RW) {
  const r = checkFile(rel, { mode });
  return r.ok ? null : r.reason;
}

function withArtifacts(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "delivery-check-"));
  try {
    for (const [rel, mode] of files) {
      const path = join(dir, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "x", "utf8");
      if (mode) chmodSync(path, mode);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("直下に置いてよいのは台帳と進捗とレポートだけ", () => {
  assert.deepEqual(ROOT_ALLOWED, [
    "cases.tsv",
    "requirements.tsv",
    "progress.json",
    "progress.prev.json",
    "report.md",
    "stop-report.json",
    "delivered.json",
  ]);
});

test("詰まって降りたときの停止報告が許可されている", () => {
  assert.equal(reasonFor("stop-report.json"), null);
});

test("納品完了マーカーが許可されている", () => {
  assert.equal(reasonFor("delivered.json"), null);
});

test("直下の許可された名前は通る", () => {
  for (const name of ROOT_ALLOWED) assert.equal(reasonFor(name), null, `${name} が弾かれた`);
});

test("直下の知らないファイルは弾く", () => {
  assert.match(reasonFor("notes.md"), /直下/);
});

test("書き込みの一時ファイルが残っていたら弾く", () => {
  assert.match(reasonFor(".cases.tsv.tmp"), /一時ファイル/);
});

test("証跡のコマンド一覧とログと画像は通る", () => {
  assert.equal(reasonFor("evidence/T-001/commands.md"), null);
  assert.equal(reasonFor("evidence/T-001/1-npm-test.log"), null);
  assert.equal(reasonFor("evidence/T-001/2-screen.png"), null);
});

test("スクリーンショットが停止の対象にならない", () => {
  for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp"]) {
    assert.equal(reasonFor(`evidence/T-001/3-shot${ext}`), null, `${ext} が弾かれた`);
  }
});

test("fixtures 配下は拡張子を問わず通る", () => {
  assert.equal(reasonFor("evidence/T-001/fixtures/input.csv"), null);
  assert.equal(reasonFor("evidence/T-001/fixtures/expected.bin"), null);
  assert.equal(reasonFor("evidence/T-001/fixtures/nested/deep.json"), null);
});

test("証跡の知らない拡張子は弾く", () => {
  assert.match(reasonFor("evidence/T-001/dump.bin"), /拡張子/);
});

test("evidence 直下にファイルを置けない", () => {
  assert.match(reasonFor("evidence/stray.log"), /ケースごとのディレクトリ/);
});

test("evidence 以外のディレクトリは弾く", () => {
  assert.match(reasonFor("scratch/x.md"), /置けない/);
});

test("スクリプト拡張子はどこにあっても弾く", () => {
  for (const ext of SCRIPT_EXTENSIONS) {
    assert.match(reasonFor(`evidence/T-001/fixtures/run${ext}`), /スクリプト/, `${ext} が通った`);
  }
});

test("実行権限のついたファイルはどこにあっても弾く", () => {
  assert.match(reasonFor("evidence/T-001/1-a.log", RWX), /実行権限/);
  assert.match(reasonFor("report.md", RWX), /実行権限/);
});

test("証跡に置いてよい拡張子の一覧に .md と .log が含まれる", () => {
  assert.ok(EVIDENCE_ALLOWED_EXT.includes(".md"));
  assert.ok(EVIDENCE_ALLOWED_EXT.includes(".log"));
});

test("checkArtifacts は正常な成果物を通す", () => {
  withArtifacts(
    [
      ["cases.tsv", null],
      ["requirements.tsv", null],
      ["report.md", null],
      ["evidence/T-001/commands.md", null],
      ["evidence/T-001/1-npm-test.log", null],
      ["evidence/T-001/fixtures/input.csv", null],
    ],
    (dir) => {
      const r = checkArtifacts(dir);
      assert.equal(r.ok, true, JSON.stringify(r.problems));
      assert.equal(r.fileCount, 6);
    },
  );
});

test("checkArtifacts は混入したスクリプトを問題として挙げる", () => {
  withArtifacts([["cases.tsv", null], ["evidence/T-001/setup.sh", null]], (dir) => {
    const r = checkArtifacts(dir);
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].path, "evidence/T-001/setup.sh");
  });
});

test("checkArtifacts は問題を全部挙げる。1 件目で止まらない", () => {
  withArtifacts([["a.sh", null], ["b.py", null], ["notes.md", null]], (dir) => {
    assert.equal(checkArtifacts(dir).problems.length, 3);
  });
});

test("checkArtifacts はディレクトリが無ければ問題として返す", () => {
  const r = checkArtifacts(join(tmpdir(), "delivery-check-nonexistent-dir"));
  assert.equal(r.ok, false);
  assert.match(r.problems[0].reason, /無い/);
});

test("拡張されたスクリプト拡張子はfixtures配下でも弾く", () => {
  for (const ext of [".exe", ".php", ".jar", ".vbs", ".dll"]) {
    assert.match(reasonFor(`evidence/T-001/fixtures/payload${ext}`), /スクリプト/, `${ext} が通ってしまった`);
  }
});
