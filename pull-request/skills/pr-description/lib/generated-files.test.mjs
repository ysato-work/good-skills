import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isGeneratedValue, parseCheckAttr, listGeneratedFiles } from "./generated-files.mjs";

const CLI_PATH = fileURLToPath(new URL("./generated-files.mjs", import.meta.url));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
const commit = (cwd) => {
  git(cwd, "add", "-A");
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@ultra-kiai.work", "commit", "-q", "--allow-empty", "-m", "c");
};
const put = (cwd, files) => {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), body);
  }
};

// base を main に作り、feat ブランチに head の変更をコミットした実リポジトリを返す
function makeRepo({ base = {}, head = {} }) {
  const cwd = mkdtempSync(join(tmpdir(), "generated-files-"));
  git(cwd, "init", "-q", "-b", "main");
  put(cwd, { README: "x", ...base });
  commit(cwd);
  git(cwd, "checkout", "-q", "-b", "feat");
  put(cwd, head);
  commit(cwd);
  return cwd;
}

const list = (repo) => listGeneratedFiles({ base: "main", cwd: repo });

const cli = (args, cwd) => execFileSync(process.execPath, [CLI_PATH, ...args], { cwd, stdio: "pipe" });

// 失敗は assert.throws で捕まえ、終了コードと標準エラーを返す
const runCli = (args, cwd) => {
  let result = { status: 0, stderr: "" };
  try {
    cli(args, cwd);
  } catch (err) {
    assert.throws(() => cli(args, cwd));
    result = { status: err.status, stderr: String(err.stderr) };
  }
  return result;
};

test("isGeneratedValue は set を生成ファイルとみなす", () => {
  assert.strictEqual(isGeneratedValue("set"), true);
});

test("isGeneratedValue は true を生成ファイルとみなす", () => {
  assert.strictEqual(isGeneratedValue("true"), true);
});

test("isGeneratedValue は unset を生成ファイルとみなさない", () => {
  assert.strictEqual(isGeneratedValue("unset"), false);
});

test("isGeneratedValue は unspecified を生成ファイルとみなさない", () => {
  assert.strictEqual(isGeneratedValue("unspecified"), false);
});

test("isGeneratedValue は false を生成ファイルとみなさない", () => {
  assert.strictEqual(isGeneratedValue("false"), false);
});

test("isGeneratedValue は set・unset・unspecified・false 以外の文字列を生成ファイルとみなす", () => {
  assert.strictEqual(isGeneratedValue("yes"), true);
});

test("parseCheckAttr は set のパスだけを返す", () => {
  assert.deepStrictEqual(
    parseCheckAttr("a.lock\0linguist-generated\0set\0b.js\0linguist-generated\0unspecified\0"),
    ["a.lock"],
  );
});

test("parseCheckAttr は空文字列から空配列を返す", () => {
  assert.deepStrictEqual(parseCheckAttr(""), []);
});

test("parseCheckAttr は生成ファイルが無ければ空配列を返す", () => {
  assert.deepStrictEqual(
    parseCheckAttr("a.js\0linguist-generated\0unspecified\0b.js\0linguist-generated\0unset\0"),
    [],
  );
});

test("parseCheckAttr は入力順のまま返す", () => {
  assert.deepStrictEqual(
    parseCheckAttr(
      "z.lock\0linguist-generated\0set\0m.js\0linguist-generated\0unspecified\0a.lock\0linguist-generated\0true\0",
    ),
    ["z.lock", "a.lock"],
  );
});

test("parseCheckAttr は値が false のパスを除く", () => {
  assert.deepStrictEqual(parseCheckAttr("k.lock\0linguist-generated\0false\0"), []);
});

test("parseCheckAttr は日本語と空白を含むパスをそのまま返す", () => {
  assert.deepStrictEqual(
    parseCheckAttr("生成/結果 1.json\0linguist-generated\0set\0"),
    ["生成/結果 1.json"],
  );
});

test("linguist-generated の指定があるファイルだけを返す", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\n" },
    head: { "yarn.lock": "a", "src.js": "b" },
  });
  assert.deepStrictEqual(list(repo), ["yarn.lock"]);
});

test("linguist-generated=true も生成ファイルとみなす", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "gen/** linguist-generated=true\n" },
    head: { "gen/a.js": "a" },
  });
  assert.ok(list(repo).includes("gen/a.js"));
});

test("-linguist-generated で打ち消したファイルは含めない", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\nkeep.lock -linguist-generated\n" },
    head: { "keep.lock": "a", "other.lock": "b" },
  });
  const out = list(repo);
  assert.ok(!out.includes("keep.lock"));
  assert.ok(out.includes("other.lock"));
});

test("!linguist-generated で打ち消したファイルは含めない", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\nkeep.lock !linguist-generated\n" },
    head: { "keep.lock": "a", "other.lock": "b" },
  });
  const out = list(repo);
  assert.ok(!out.includes("keep.lock"));
  assert.ok(out.includes("other.lock"));
});

test("linguist-generated=false で打ち消したファイルは含めない", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\nkeep.lock linguist-generated=false\n" },
    head: { "keep.lock": "a", "other.lock": "b" },
  });
  const out = list(repo);
  assert.ok(!out.includes("keep.lock"));
  assert.ok(out.includes("other.lock"));
});

test("日本語のパスを引用符やエスケープ無しで返す", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "生成/結果.json linguist-generated\n" },
    head: { "生成/結果.json": "{}" },
  });
  assert.ok(list(repo).includes("生成/結果.json"));
});

test("空白を含むパスを返す", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\n" },
    head: { "my dir/a b.lock": "a" },
  });
  assert.deepStrictEqual(list(repo), ["my dir/a b.lock"]);
});

test("ディレクトリ配下のパターンに合うファイルだけを返す", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "dist/** linguist-generated\n" },
    head: { "dist/x/y.js": "a", "src/y.js": "b" },
  });
  assert.deepStrictEqual(list(repo), ["dist/x/y.js"]);
});

test("PR 内で追加した .gitattributes の指定が効く", () => {
  const repo = makeRepo({
    head: { ".gitattributes": "*.lock linguist-generated\n", "yarn.lock": "a" },
  });
  assert.deepStrictEqual(list(repo), ["yarn.lock"]);
});

test("PR 内で追記した打ち消しが効く", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\n" },
    head: {
      ".gitattributes": "*.lock linguist-generated\nkeep.lock -linguist-generated\n",
      "keep.lock": "a",
      "b.lock": "b",
    },
  });
  const out = list(repo);
  assert.ok(!out.includes("keep.lock"));
  assert.ok(out.includes("b.lock"));
});

test(".gitattributes が無ければ空配列を返す", () => {
  const repo = makeRepo({ head: { "a.js": "a", "b.lock": "b" } });
  assert.deepStrictEqual(list(repo), []);
});

test("変更が無ければ例外を投げず空配列を返す", () => {
  const repo = makeRepo({ base: { ".gitattributes": "*.lock linguist-generated\n" } });
  assert.deepStrictEqual(list(repo), []);
});

test("指定に合うファイルは全て含み、合わないファイルは含めない", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\n" },
    head: { "b.lock": "b", "a.lock": "a", "c.js": "c" },
  });
  const out = list(repo);
  assert.ok(out.includes("a.lock"));
  assert.ok(out.includes("b.lock"));
  assert.ok(!out.includes("c.js"));
});

test("存在しない base なら例外を投げる", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  assert.throws(() => listGeneratedFiles({ base: "no-such-ref", cwd: repo }));
});

test("git リポジトリでない cwd なら例外を投げる", () => {
  const dir = mkdtempSync(join(tmpdir(), "generated-files-"));
  assert.throws(() => listGeneratedFiles({ base: "main", cwd: dir }));
});

test("CLI は成功すると --out に生成ファイルの JSON 配列を書いて終了コード 0 になる", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "*.lock linguist-generated\n" },
    head: { "yarn.lock": "a", "src.js": "b" },
  });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "main", "--out", out], repo);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(readFileSync(out, "utf8")), ["yarn.lock"]);
});

test("CLI は生成ファイルが無くても空配列を書いて終了コード 0 になる", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "main", "--out", out], repo);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(readFileSync(out, "utf8")), []);
});

test("CLI は変更が無くても空配列を書いて終了コード 0 になる", () => {
  const repo = makeRepo({});
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "main", "--out", out], repo);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(readFileSync(out, "utf8")), []);
});

test("CLI は git が失敗すると終了コード 1 で標準エラーに理由を出し --out を作らない", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "no-such-ref", "--out", out], repo);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr, "");
  assert.strictEqual(existsSync(out), false);
});

test("CLI は git が失敗しても既存の --out の中身を変えない", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  writeFileSync(out, "keep");
  const r = runCli(["--base", "no-such-ref", "--out", out], repo);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(readFileSync(out, "utf8"), "keep");
});

test("CLI は --out が無ければ終了コード 1 で標準エラーに理由を出す", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const r = runCli(["--base", "main"], repo);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr, "");
});

test("CLI は --base が無ければ終了コード 1 で標準エラーに理由を出し --out を作らない", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--out", out], repo);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr, "");
  assert.strictEqual(existsSync(out), false);
});

test("CLI は引数が無ければ終了コード 1 で標準エラーに理由を出す", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const r = runCli([], repo);
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.stderr, "");
});

test("CLI は git リポジトリの外で実行すると終了コード 1 になり --out を作らない", () => {
  const dir = mkdtempSync(join(tmpdir(), "generated-files-"));
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "main", "--out", out], dir);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(existsSync(out), false);
});

test("サブディレクトリから実行してもリポジトリ直下からのパスで生成ファイルを返す", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "dist/** linguist-generated\n", "src/keep.js": "k" },
    head: { "dist/a.js": "a" },
  });
  assert.deepStrictEqual(listGeneratedFiles({ base: "main", cwd: join(repo, "src") }), ["dist/a.js"]);
});

test("CLI はサブディレクトリで実行しても生成ファイルを --out に書く", () => {
  const repo = makeRepo({
    base: { ".gitattributes": "dist/** linguist-generated\n", "src/keep.js": "k" },
    head: { "dist/a.js": "a" },
  });
  const out = join(mkdtempSync(join(tmpdir(), "generated-files-")), "out.json");
  const r = runCli(["--base", "main", "--out", out], join(repo, "src"));
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(readFileSync(out, "utf8")), ["dist/a.js"]);
});

test("CLI は -- で始まる --base を git のオプションとして読まず、終了コード 1 になる", () => {
  const repo = makeRepo({ head: { "a.js": "a" } });
  const dir = mkdtempSync(join(tmpdir(), "generated-files-"));
  const out = join(dir, "out.json");
  const injected = join(dir, "injected");
  const r = runCli(["--base", "--output=" + injected, "--out", out], repo);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(existsSync(injected), false);
  assert.strictEqual(existsSync(out), false);
});
