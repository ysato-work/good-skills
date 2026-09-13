import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import {
  TESTING_ROOT,
  artifactDir,
  casesPath,
  commandsPath,
  evidenceDir,
  fixturesDir,
  logFileName,
  progressPath,
  progressPrevPath,
  reportPath,
  requirementsPath,
  slugify,
  specSlug,
} from "./paths.mjs";

test("specSlug は拡張子と末尾の -design を落とす", () => {
  assert.equal(
    specSlug("docs/superpowers/specs/2026-08-31-台帳の契約-design.md"),
    "2026-08-31-台帳の契約",
  );
});

test("specSlug は -design が無いファイル名でも動く", () => {
  assert.equal(specSlug("/abs/2026-01-01-なにか.md"), "2026-01-01-なにか");
});

test("artifactDir は検証対象リポジトリの docs/superpowers/testing の下を指す", () => {
  assert.equal(
    artifactDir("/repo", "docs/superpowers/specs/2026-08-31-台帳の契約-design.md"),
    join("/repo", TESTING_ROOT, "2026-08-31-台帳の契約"),
  );
});

test("成果物ファイルのパスが契約どおり", () => {
  const d = "/a/b";
  assert.equal(casesPath(d), join(d, "cases.tsv"));
  assert.equal(requirementsPath(d), join(d, "requirements.tsv"));
  assert.equal(progressPath(d), join(d, "progress.json"));
  assert.equal(progressPrevPath(d), join(d, "progress.prev.json"));
  assert.equal(reportPath(d), join(d, "report.md"));
});

test("証跡はケースごとのディレクトリに分かれる", () => {
  const d = "/a/b";
  assert.equal(evidenceDir(d, "T-001"), join(d, "evidence", "T-001"));
  assert.equal(commandsPath(d, "T-001"), join(d, "evidence", "T-001", "commands.md"));
  assert.equal(fixturesDir(d, "T-001"), join(d, "evidence", "T-001", "fixtures"));
});

test("slugify は ASCII 以外を落として繋ぐ", () => {
  assert.equal(slugify("npm run test:unit"), "npm-run-test-unit");
});

test("slugify は全部落ちたら cmd を返す", () => {
  assert.equal(slugify("結合テストを叩く"), "cmd");
});

test("logFileName は連番つきのログ名を作る", () => {
  assert.equal(logFileName(1, "npm test"), "1-npm-test.log");
  assert.equal(logFileName(2, "結合テストを叩く"), "2-cmd.log");
});
