import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandsPath, evidenceDir } from "./paths.mjs";
import { renderCommands } from "./evidence.mjs";
import {
  checkCommandsRecorded,
  checkReferencedLogsExist,
  duplicateLogDigestPairs,
  checkBatchEvidence,
} from "./evidence-check.mjs";

function fresh() {
  return mkdtempSync(join(tmpdir(), "evidence-check-test-"));
}

function ensureCase(artifact, caseId) {
  mkdirSync(evidenceDir(artifact, caseId), { recursive: true });
}

/** renderCommands 経由で本物と同じ形式の commands.md を書く */
function writeRealCommands(artifact, caseId, entries, opts) {
  writeFileSync(commandsPath(artifact, caseId), renderCommands(caseId, entries, opts), "utf8");
}

test("checkCommandsRecorded: 空ファイルは NG", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeFileSync(commandsPath(a, "T-001"), "", "utf8");
  assert.equal(checkCommandsRecorded(a, "T-001").ok, false);
  rmSync(a, { recursive: true, force: true });
});

test("checkCommandsRecorded: 文章だけで終了コードの表が無い場合は NG", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeFileSync(commandsPath(a, "T-001"), "# T-001\n\n何かをやりました。\n", "utf8");
  assert.equal(checkCommandsRecorded(a, "T-001").ok, false);
  rmSync(a, { recursive: true, force: true });
});

test("checkCommandsRecorded: renderCommands 形式で 1 行以上あれば OK", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeRealCommands(a, "T-001", [{ command: "npm test", exitCode: 0, logFile: "1-npm-test.log" }]);
  assert.equal(checkCommandsRecorded(a, "T-001").ok, true);
  rmSync(a, { recursive: true, force: true });
});

test("checkReferencedLogsExist: 参照ログが実在し空でなければ OK", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeRealCommands(a, "T-001", [{ command: "npm test", exitCode: 0, logFile: "1-npm-test.log" }]);
  writeFileSync(join(evidenceDir(a, "T-001"), "1-npm-test.log"), "output\n", "utf8");
  assert.equal(checkReferencedLogsExist(a, "T-001").ok, true);
  rmSync(a, { recursive: true, force: true });
});

test("checkReferencedLogsExist: 参照ログが無いと NG", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeRealCommands(a, "T-001", [{ command: "npm test", exitCode: 0, logFile: "1-npm-test.log" }]);
  // ログファイルは書かない
  assert.equal(checkReferencedLogsExist(a, "T-001").ok, false);
  rmSync(a, { recursive: true, force: true });
});

test("checkReferencedLogsExist: (記録なし) 行はログ不在でも OK", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeRealCommands(a, "T-001", [{ command: "heavy", exitCode: 0, logFile: "" }]); // logFile 空 → (記録なし)
  assert.equal(checkReferencedLogsExist(a, "T-001").ok, true);
  rmSync(a, { recursive: true, force: true });
});

test("duplicateLogDigestPairs: ログ本文が完全一致する 2 件を検出", () => {
  const a = fresh();
  for (const id of ["T-001", "T-002"]) {
    ensureCase(a, id);
    writeRealCommands(a, id, [{ command: `x --${id}`, exitCode: 0, logFile: "1.log" }]);
    writeFileSync(join(evidenceDir(a, id), "1.log"), "SAME_CONTENT\n", "utf8");
  }
  const dups = duplicateLogDigestPairs(a, ["T-001", "T-002"]);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].sort(), ["T-001", "T-002"]);
  rmSync(a, { recursive: true, force: true });
});

test("duplicateLogDigestPairs: コマンドが違っても本文が違えば誤検出しない", () => {
  const a = fresh();
  for (const [id, body] of [["T-001", "AAA\n"], ["T-002", "BBB\n"]]) {
    ensureCase(a, id);
    writeRealCommands(a, id, [{ command: "x", exitCode: 0, logFile: "1.log" }]);
    writeFileSync(join(evidenceDir(a, id), "1.log"), body, "utf8");
  }
  assert.equal(duplicateLogDigestPairs(a, ["T-001", "T-002"]).length, 0);
  rmSync(a, { recursive: true, force: true });
});

test("duplicateLogDigestPairs: (記録なし) だけのケースは対象外", () => {
  const a = fresh();
  for (const id of ["T-001", "T-002"]) {
    ensureCase(a, id);
    writeRealCommands(a, id, [{ command: "x", exitCode: 0, logFile: "" }]);
  }
  assert.equal(duplicateLogDigestPairs(a, ["T-001", "T-002"]).length, 0);
  rmSync(a, { recursive: true, force: true });
});

test("checkReferencedLogsExist: logName がパストラバーサル (../) で評価ディレクトリ外を指す場合は NG", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  // 評価ディレクトリ (a/evidence/T-001) の外、a 直下に実在する別ファイルを用意する。
  // dir から見て 2 階層上 (../../) を辿れば届く場所。
  writeFileSync(join(a, "outside.log"), "OUTSIDE_SECRET\n", "utf8");
  writeRealCommands(a, "T-001", [
    { command: "x", exitCode: 0, logFile: "../../outside.log" },
  ]);
  const v = checkReferencedLogsExist(a, "T-001");
  assert.equal(v.ok, false);
  rmSync(a, { recursive: true, force: true });
});

test("duplicateLogDigestPairs: パストラバーサルで同じ外部ファイルを指しても指紋計算に使われず誤検出しない", () => {
  const a = fresh();
  writeFileSync(join(a, "outside.log"), "OUTSIDE_SECRET\n", "utf8");
  for (const id of ["T-001", "T-002"]) {
    ensureCase(a, id);
    writeRealCommands(a, id, [
      { command: `x --${id}`, exitCode: 0, logFile: "../../outside.log" },
    ]);
  }
  // トラバーサルが素通りしていれば同一本文として重複検出されてしまう (誤検出)。
  // 塞がれていれば両ケースとも参照ログ無し扱いになり fingerprint は null → 重複なし。
  assert.equal(duplicateLogDigestPairs(a, ["T-001", "T-002"]).length, 0);
  rmSync(a, { recursive: true, force: true });
});

test("checkReferencedLogsExist: logName がシンボリックリンクで評価ディレクトリ外を指す場合は NG", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  // 評価ディレクトリの外、a 直下に実在する別ファイルを用意する (中身は非空)。
  writeFileSync(join(a, "outside.log"), "OUTSIDE_SECRET\n", "utf8");
  // 評価ディレクトリの内側に、外を指すシンボリックリンクを local name で置く。
  // logName 自体には "../" を含めない (レキシカルチェックだけでは弾けないケース)。
  symlinkSync(join(a, "outside.log"), join(evidenceDir(a, "T-001"), "fake.log"));
  writeRealCommands(a, "T-001", [{ command: "x", exitCode: 0, logFile: "fake.log" }]);
  const v = checkReferencedLogsExist(a, "T-001");
  assert.equal(v.ok, false);
  rmSync(a, { recursive: true, force: true });
});

test("checkBatchEvidence: 各ケースの検査結果をまとめる", () => {
  const a = fresh();
  ensureCase(a, "T-001");
  writeRealCommands(a, "T-001", [{ command: "x", exitCode: 0, logFile: "1.log" }]);
  writeFileSync(join(evidenceDir(a, "T-001"), "1.log"), "A\n", "utf8");
  ensureCase(a, "T-002"); // commands.md が無い
  const v = checkBatchEvidence(a, ["T-001", "T-002"]);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.caseId === "T-002"));
  assert.ok(!v.problems.some((p) => p.caseId === "T-001"));
  rmSync(a, { recursive: true, force: true });
});
