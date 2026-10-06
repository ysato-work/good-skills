import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NOT_GENERATED = new Set(["unset", "unspecified", "false"]);

// GitHub の Linguist と同じく、打ち消し・未指定・false 以外はすべて生成ファイルとみなす。
export function isGeneratedValue(value) {
  return !NOT_GENERATED.has(value);
}

export function parseCheckAttr(stdout) {
  const parts = stdout.split("\0");
  const generated = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (isGeneratedValue(parts[i + 2])) generated.push(parts[i]);
  }
  return generated;
}

export function listGeneratedFiles({ base, cwd }) {
  // check-attr は渡されたパスを cwd 相対として読むが、diff はリポジトリ直下からのパスを返す。
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const names = execFileSync("git", ["diff", "--name-only", "-z", "--end-of-options", `${base}...HEAD`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter(Boolean);
  if (names.length === 0) return [];
  const stdout = execFileSync("git", ["check-attr", "-z", "--stdin", "linguist-generated"], {
    cwd: root,
    encoding: "utf8",
    input: names.join("\0") + "\0",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return parseCheckAttr(stdout);
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const base = argValue(argv, "--base");
  const out = argValue(argv, "--out");
  if (!base || !out) {
    console.error("usage: generated-files.mjs --base <ref> --out <path>");
    process.exit(1);
  }
  let generated;
  try {
    generated = listGeneratedFiles({ base, cwd: process.cwd() });
  } catch (e) {
    console.error(`generated-files: git への問い合わせに失敗した: ${e.stderr?.toString().trim() || e.message}`);
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(generated));
}
