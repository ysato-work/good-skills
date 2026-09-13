#!/usr/bin/env node
/**
 * check-progress.mjs
 *
 * 台帳を読んで progress.json を書き、終了コードで完了可否を返す。
 *
 * 完走したかどうかの唯一の判定者はこのスクリプトである。同じ判定を別の場所に
 * 二重に持つと必ず食い違うので、ゲートも CI もこの終了コードをそのまま使う。
 *
 * 終了コードは 3 値にしてある。
 *   0 完了 / 1 未完 / 2 検査できなかった
 * 台帳の fail と error を分けるのと同じ理由である。「まだ終わっていない」と
 * 「そもそも検査できなかった」を同じ値に潰すと、無人実行で区別が失われる。
 *
 * 前ターンの集計は progress.prev.json に回す。todo が減っていなければ前進 0 と
 * 判定される。S5 はこれを見て自主停止する。
 *
 * 使い方:
 *   node check-progress.mjs --dir <成果物ディレクトリ> --phase generation|execution
 *
 * export:
 *   parseArgs(argv)         → { dir, phase }
 *   runCheck({ dir, phase }) → { code, stdout, stderr }
 *   main(argv)              → 終了コード
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readCases, readRequirements, validateCases, validateRequirements } from "./ledger.mjs";
import { PHASES, computeProgress } from "./progress.mjs";
import { casesPath, progressPath, progressPrevPath, requirementsPath } from "./paths.mjs";

export function parseArgs(argv) {
  const out = { dir: null, phase: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir") {
      out.dir = argv[i + 1] ?? null;
      i += 1;
    } else if (argv[i] === "--phase") {
      out.phase = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return out;
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function runCheck({ dir, phase }) {
  if (!dir) {
    return { code: 2, stdout: "", stderr: "--dir に成果物ディレクトリを指定する\n" };
  }
  if (!PHASES.includes(phase)) {
    return { code: 2, stdout: "", stderr: `--phase は ${PHASES.join(" / ")} のどちらか\n` };
  }

  const casesFile = casesPath(dir);
  const requirementsFile = requirementsPath(dir);
  if (!existsSync(casesFile)) {
    return { code: 2, stdout: "", stderr: `${casesFile} が無い\n` };
  }
  if (!existsSync(requirementsFile)) {
    return { code: 2, stdout: "", stderr: `${requirementsFile} が無い\n` };
  }

  let cases;
  let requirements;
  try {
    cases = readCases(casesFile);
    requirements = readRequirements(requirementsFile);
  } catch (err) {
    return { code: 2, stdout: "", stderr: `${err.message}\n` };
  }

  const problems = validateCases(cases);
  if (problems.length > 0) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    return { code: 2, stdout: "", stderr: `cases.tsv が契約に反している\n${detail}\n` };
  }

  const requirementProblems = validateRequirements(requirements);
  if (requirementProblems.length > 0) {
    const detail = requirementProblems.map((p) => `  - ${p}`).join("\n");
    return { code: 2, stdout: "", stderr: `requirements.tsv が契約に反している\n${detail}\n` };
  }

  const current = progressPath(dir);
  const prev = existsSync(current) ? parseJsonOrNull(readFileSync(current, "utf8")) : null;
  const progress = computeProgress({ cases, requirements, prev, phase });

  if (existsSync(current)) renameSync(current, progressPrevPath(dir));
  writeFileSync(current, `${JSON.stringify(progress, null, 2)}\n`, "utf8");

  return {
    code: progress.done ? 0 : 1,
    stdout: `${JSON.stringify(progress, null, 2)}\n`,
    stderr: "",
  };
}

export function main(argv) {
  const { code, stdout, stderr } = runCheck(parseArgs(argv));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
