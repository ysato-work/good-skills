import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 判定に使う本文は、必ず生の Markdown が返る経路で取る。HTML コメントを
// 落として返す経路で取ると印が消えて見え、スキルが書いた本文を人が書いた
// ものと誤判定する。誤判定すると実行のたびに同じ説明文が積み上がるため、
// 経路はこのファイルに固定して呼び出し側に選ばせない。
export function interpretFetch({ status, stdout, stderr }) {
  if (status !== 0) {
    const reason = (stderr || "").trim();
    return { ok: false, reason: reason === "" ? `gh exited with ${status}` : reason };
  }
  const raw = stdout || "";
  return { ok: true, body: raw.trim() === "null" ? "" : raw };
}

// PR 番号は API のパスに埋める。打ち間違いを 404 ではなく明確なエラーにする。
export function validatePrNumber(pr) {
  if (typeof pr !== "string" || !/^\d+$/.test(pr)) {
    return { ok: false, reason: `invalid --pr: ${pr}` };
  }
  return { ok: true };
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
    console.error("usage: fetch-body.mjs --pr <number> --out <path>");
    process.exit(1);
  }
  const prCheck = validatePrNumber(pr);
  if (!prCheck.ok) {
    console.log(JSON.stringify({ ok: false, reason: prCheck.reason }));
    process.exit(1);
  }
  let result;
  try {
    const stdout = execFileSync("gh", ["api", `repos/{owner}/{repo}/pulls/${pr}`, "--jq", ".body"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    result = interpretFetch({ status: 0, stdout });
  } catch (e) {
    result = interpretFetch({
      status: e.status === undefined ? 1 : e.status,
      stderr: e.stderr === undefined ? e.message : e.stderr.toString(),
    });
  }
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, reason: result.reason }));
    process.exit(1);
  }
  writeFileSync(out, result.body, "utf8");
  console.log(JSON.stringify({ ok: true }));
}
