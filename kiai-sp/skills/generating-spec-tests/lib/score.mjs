#!/usr/bin/env node
/**
 * score.mjs
 *
 * 採点結果を読み、閾値で passed / dropped に分ける。
 *
 * **採点が取れなかった指摘を中間値で埋めない。** このパイプラインは取りこぼしが
 * 次周回で回復しない。テスト計画は 1 回しか作られず、落ちた指摘は次に拾われない。
 * 中間値で埋めると閾値で自動的に dropped に落ちるため、採点系のバグが「指摘が
 * 少なかっただけ」に見えて永久に気づけない。
 *
 * 塞ぎ方は 2 つ重ねてある。partitionByThreshold は未採点があれば throw する。
 * assertThreshold は閾値を 51〜99 に限る。この 2 つがある限り、50 で埋めて素通り
 * させる経路は書けない。
 *
 * 未採点があるときの挙動は試行回数で変える。上限内なら「再採点せよ」を意味する 3、
 * 超えたら「検査できなかった」を意味する 2 で止める。何が採点できなかったかを
 * 必ずメッセージに出す。
 *
 * export:
 *   MAX_SCORE_ATTEMPTS
 *   assertThreshold(threshold)
 *   collectScores(workdir, flat)          → { scored, missing }
 *   partitionByThreshold(scored, threshold) → { passed, dropped }
 *   runScore({ workdir, threshold, attempt, maxAttempts }) → { code, stdout, stderr }
 *
 * CLI:
 *   node score.mjs --workdir <dir> --threshold <n> --attempt <n>
 *   終了コード: 0 完了 / 2 検査できなかった / 3 再採点せよ
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIDENCE_THRESHOLD } from "../../../lib/spec-testing/constants.mjs";

/** 採点のやり直し上限。超えたらエラーで停止する */
export const MAX_SCORE_ATTEMPTS = 3;

export function assertThreshold(threshold) {
  if (!Number.isInteger(threshold) || threshold < 51 || threshold > 99) {
    throw new Error(`閾値は 51 以上 99 以下の整数にする。受け取った値: ${threshold}`);
  }
}

export function collectScores(workdir, flat) {
  const scored = [];
  const missing = [];

  for (const finding of flat) {
    const path = join(workdir, "confidence", `${finding.id}.json`);
    let confidence = null;
    let plus = [];
    let minus = [];

    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        if (typeof parsed?.confidence === "number") {
          confidence = parsed.confidence;
          plus = parsed.confidence_plus ?? [];
          minus = parsed.confidence_minus ?? [];
        }
      } catch {
        confidence = null;
      }
    }

    if (confidence === null) missing.push(finding.id);
    scored.push({ ...finding, confidence, confidence_plus: plus, confidence_minus: minus });
  }

  return { scored, missing };
}

export function partitionByThreshold(scored, threshold) {
  assertThreshold(threshold);

  const unscored = scored.filter((s) => typeof s.confidence !== "number");
  if (unscored.length > 0) {
    throw new Error(
      `採点できていない指摘がある: ${unscored.map((u) => u.id).join(", ")}。中間値で埋めない`,
    );
  }

  const passed = [];
  const dropped = [];
  for (const item of scored) (item.confidence >= threshold ? passed : dropped).push(item);
  return { passed, dropped };
}

export function runScore({
  workdir,
  threshold = CONFIDENCE_THRESHOLD,
  attempt = 1,
  maxAttempts = MAX_SCORE_ATTEMPTS,
}) {
  try {
    assertThreshold(threshold);
  } catch (err) {
    return { code: 2, stdout: "", stderr: `${err.message}\n` };
  }

  const flatPath = join(workdir, "flat-issues.json");
  if (!existsSync(flatPath)) {
    return { code: 2, stdout: "", stderr: `${flatPath} が無い\n` };
  }

  let flat;
  try {
    flat = JSON.parse(readFileSync(flatPath, "utf8"));
  } catch (err) {
    return { code: 2, stdout: "", stderr: `flat-issues.json が読めない: ${err.message}\n` };
  }

  const { scored, missing } = collectScores(workdir, flat);

  if (missing.length > 0) {
    if (attempt < maxAttempts) {
      return {
        code: 3,
        stdout: "",
        stderr: `未採点が ${missing.length} 件ある: ${missing.join(", ")}。${attempt + 1} 回目の採点を投げること\n`,
      };
    }
    return {
      code: 2,
      stdout: "",
      stderr: `${maxAttempts} 回試しても採点できなかった指摘がある: ${missing.join(", ")}\n`,
    };
  }

  const { passed, dropped } = partitionByThreshold(scored, threshold);
  writeFileSync(join(workdir, "passed.json"), JSON.stringify(passed, null, 2), "utf8");
  writeFileSync(join(workdir, "dropped.json"), JSON.stringify(dropped, null, 2), "utf8");

  return {
    code: 0,
    stdout: `passed: ${passed.length}, dropped: ${dropped.length}\n`,
    stderr: "",
  };
}

function parseArgs(argv) {
  const out = { workdir: null, threshold: CONFIDENCE_THRESHOLD, attempt: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--workdir") {
      out.workdir = argv[i + 1] ?? null;
      i += 1;
    } else if (argv[i] === "--threshold") {
      out.threshold = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--attempt") {
      out.attempt = Number(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workdir) {
    process.stderr.write("--workdir を指定する\n");
    process.exit(2);
  }
  const { code, stdout, stderr } = runScore(args);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(code);
}
