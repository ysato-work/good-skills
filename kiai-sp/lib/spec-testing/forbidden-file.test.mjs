import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyFile,
  countAssertions,
  isCiConfig,
  isLedgerTsv,
  isTestFile,
} from "./forbidden-file.mjs";

function blockedBy(input) {
  const v = classifyFile(input);
  return v.blocked ? v.ruleId : null;
}

test("isCiConfig は CI 設定ファイルを見分ける", () => {
  assert.equal(isCiConfig(".github/workflows/ci.yml"), true);
  assert.equal(isCiConfig("/repo/.gitlab-ci.yml"), true);
  assert.equal(isCiConfig("/repo/Jenkinsfile"), true);
  assert.equal(isCiConfig("src/github/workflows.ts"), false);
});

test("isTestFile はテストファイルを見分ける", () => {
  assert.equal(isTestFile("src/foo.test.ts"), true);
  assert.equal(isTestFile("tests/test_foo.py"), true);
  assert.equal(isTestFile("pkg/foo_test.go"), true);
  assert.equal(isTestFile("src/foo.ts"), false);
});

test("countAssertions はアサーションの数を数える", () => {
  assert.equal(countAssertions("assert.equal(a, b);\nassert.ok(c);"), 2);
  assert.equal(countAssertions("expect(a).toBe(b)"), 1);
  assert.equal(countAssertions("const x = 1;"), 0);
});

test("CI 設定への書き込みは止まる", () => {
  assert.equal(blockedBy({ filePath: ".github/workflows/ci.yml", content: "on: push" }), "ci-config");
});

test("スキップ指定の追加は止まる", () => {
  for (const added of [
    "it.skip('x', () => {})",
    "xit('x', () => {})",
    "@pytest.mark.skip",
    "@Ignore",
    "t.Skip()",
    "#[ignore]",
    "testPathIgnorePatterns: ['integration']",
  ]) {
    assert.equal(
      blockedBy({ filePath: "src/foo.test.ts", oldString: "", newString: added }),
      "add-skip",
      `${added} が通ってしまった`,
    );
  }
});

test("元からあったスキップ指定はそのままなら止めない", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "it.skip('x', () => { const a = 1; })",
      newString: "it.skip('x', () => { const a = 2; })",
    }),
    null,
  );
});

test("アサーションを減らす編集は止まる", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(a, 1);\nassert.equal(b, 2);",
      newString: "assert.equal(a, 1);",
    }),
    "weaken-assertion",
  );
});

test("アサーションを増やす編集は通る", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(a, 1);",
      newString: "assert.equal(a, 1);\nassert.equal(b, 2);",
    }),
    null,
  );
});

test("期待値を実際の出力に合わせて書き換える編集は止まる", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(result, 42);",
      newString: "assert.equal(result, 99);",
    }),
    "weaken-assertion",
  );
});

test("値を変えずにアサーションを別の行へ動かすだけなら通る", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "// コメント\nassert.equal(result, 42);",
      newString: "assert.equal(result, 42);\n// コメント",
    }),
    null,
  );
});

test("テストファイルを空にする書き込みは止まる", () => {
  assert.equal(blockedBy({ filePath: "src/foo.test.ts", content: "" }), "empty-test-file");
});

test("プロダクトコードの普通の編集は通る", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.ts",
      oldString: "return a;",
      newString: "return a + 1;",
    }),
    null,
  );
});

test("テストの新規作成は通る", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      content: "import assert from 'node:assert/strict';\nassert.equal(1, 1);",
    }),
    null,
  );
});

test("アサーション行のコメントアウトは止まる", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(result, 42);",
      newString: "// assert.equal(result, 42);",
    }),
    "weaken-assertion",
  );
});

test("アサーションのメソッド反転(equal→notEqual)は止まる", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(result, 42);",
      newString: "assert.notEqual(result, 42);",
    }),
    "weaken-assertion",
  );
});

test(".only によるフォーカス実行の追加は止まる", () => {
  for (const added of ["it.only('x', () => {})", "fit('x', () => {})", "fdescribe('x', () => {})"]) {
    assert.equal(
      blockedBy({ filePath: "src/foo.test.ts", oldString: "", newString: added }),
      "add-skip",
      `${added} が通ってしまった`,
    );
  }
});

test(".fit()のような通常のメソッド呼び出しはfit/fdescribe検出に引っかからない", () => {
  assert.equal(
    blockedBy({ filePath: "src/train.py", oldString: "", newString: "model.fit(X, y)" }),
    null,
  );
  assert.equal(
    blockedBy({ filePath: "src/train.py", oldString: "", newString: "self.fit(data)" }),
    null,
  );
});

test("Write全置換でアサーションを追加する内容は通る(contentベースの比較)", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(a, 1);",
      content: "assert.equal(a, 1);\nassert.equal(b, 2);",
    }),
    null,
  );
});

test("Write全置換でアサーションを削る内容は止まる(contentベースの比較)", () => {
  assert.equal(
    blockedBy({
      filePath: "src/foo.test.ts",
      oldString: "assert.equal(a, 1);\nassert.equal(b, 2);",
      content: "assert.equal(a, 1);",
    }),
    "weaken-assertion",
  );
});

test("ガード自身の実装ファイルへの書き換えは止まる", () => {
  assert.equal(
    blockedBy({ filePath: "kiai-sp/lib/spec-testing/forbidden-bash.mjs", oldString: "x", newString: "y" }),
    "guard-self-protect",
  );
  assert.equal(
    blockedBy({ filePath: "kiai-sp/lib/spec-testing/guard-hook.mjs", content: "malicious" }),
    "guard-self-protect",
  );
  assert.equal(
    blockedBy({ filePath: "kiai-sp/hooks/hooks.json", content: "{}" }),
    "guard-self-protect",
  );
});

test("ガード自身のテストファイル(*.test.mjs)への変更は通常のweaken-assertion等の判定に従う(guard-self-protectの対象外)", () => {
  assert.equal(
    blockedBy({
      filePath: "kiai-sp/lib/spec-testing/forbidden-bash.test.mjs",
      oldString: "assert.equal(a,1);",
      newString: "assert.equal(a,1);\nassert.equal(b,2);",
    }),
    null,
  );
});

test("isTestFile はRubyのspecファイルも見分ける", () => {
  assert.equal(isTestFile("spec/models/user_spec.rb"), true);
});

test("証跡ディレクトリに .mjs を書こうとすると止まる", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/evidence/T-001/helper.mjs",
    content: "export const x = 1;",
  });
  assert.equal(v.blocked, true);
  assert.equal(v.ruleId, "evidence-source-code");
});

test("証跡ディレクトリに .py を書こうとすると止まる", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/evidence/T-001/tool.py",
    content: "print(1)",
  });
  assert.equal(v.blocked, true);
});

test("evidence/T-001/fixtures 配下の .mjs は止まらない", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/evidence/T-001/fixtures/data.mjs",
    content: "export const d = 1;",
  });
  assert.equal(v.blocked, false);
});

test("evidence 配下の .txt は止まらない", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/evidence/T-001/note.txt",
    content: "memo",
  });
  assert.equal(v.blocked, false);
});

test("evidence 配下の .md は止まらない", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/evidence/T-001/commands.md",
    content: "# commands",
  });
  assert.equal(v.blocked, false);
});

test("evidence 配下でない .mjs は止まらない (本来のソースコード置き場)", () => {
  const v = classifyFile({
    filePath: "src/lib/impl.mjs",
    content: "export const y = 1;",
  });
  assert.equal(v.blocked, false);
});

test("isLedgerTsv は cases.tsv / requirements.tsv を見分ける", () => {
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/cases.tsv"), true);
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/requirements.tsv"), true);
  assert.equal(isLedgerTsv("cases.tsv"), true);
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/cases.tsv.bak"), false);
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/other.tsv"), false);
});

test("isLedgerTsv は大文字パスも見分ける (case-insensitive FS 対策)", () => {
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/CASES.TSV"), true);
  assert.equal(isLedgerTsv("docs/superpowers/testing/x/Requirements.Tsv"), true);
});

test("cases.tsv への直接 Write は止まる", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/cases.tsv",
    content: "case_id\tlevel\nT-001\tunit\n",
  });
  assert.equal(v.blocked, true);
  assert.equal(v.ruleId, "ledger-tsv");
});

test("requirements.tsv への直接 Edit は止まる", () => {
  const v = classifyFile({
    filePath: "docs/superpowers/testing/some-spec/requirements.tsv",
    oldString: "R-001\told",
    newString: "R-001\tnew",
  });
  assert.equal(v.blocked, true);
  assert.equal(v.ruleId, "ledger-tsv");
});
