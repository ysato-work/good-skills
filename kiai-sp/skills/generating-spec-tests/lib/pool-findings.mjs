/**
 * pool-findings.mjs
 *
 * レビュアの出力を 1 本のプールに集め、judge のグループ化結果から ID を採番する。
 *
 * ID 採番とプール化は JS 側に閉じ込める。LLM に連番を振らせると必ず飛ぶか重複する。
 * judge には「どの ref とどの ref が同じ問題か」だけを答えさせ、番号は触らせない。
 *
 * 壊れた入力を空配列に潰さない。このパイプラインは取りこぼしが次周回で回復しない。
 * PR は 1 回しか出ないので、落ちた指摘は次に拾われない。空配列で先に進むと
 * 「指摘が少なかっただけ」に見えて永久に気づけない。読めなければ throw する。
 *
 * ただし groups が空配列であることは正常である。全レビュアが何も指摘しなかった
 * ときの姿であり、ループの終了条件そのものになる。「読めない」と「指摘が無い」を
 * 区別する。
 *
 * 出力のファイル名は流用した chunk-confidence-batches.mjs の前提に合わせてある
 * （flat-issues.json と flat-issues/<id>.json）。名前を変えると流用が壊れる。
 *
 * export:
 *   readResults(workdir, labels)  → { [label]: findings[] }
 *   poolFindings(results)         → ref つきのプール
 *   flattenFindings(pooled, judge) → id つきの代表指摘
 *   writeFlat(workdir, flat)      → void
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function readResults(workdir, labels) {
  const results = {};
  for (const label of labels) {
    const path = join(workdir, "results", `${label}.json`);
    if (!existsSync(path)) {
      results[label] = [];
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (!Array.isArray(parsed)) throw new Error("配列ではない");
      results[label] = parsed;
    } catch (err) {
      throw new Error(`レビュア ${label} の出力が読めない: ${err.message}`);
    }
  }
  return results;
}

export function poolFindings(results) {
  const pooled = [];
  for (const [label, findings] of Object.entries(results)) {
    findings.forEach((finding, i) => {
      pooled.push({ ...finding, ref: `${label}#${i}`, label });
    });
  }
  return pooled;
}

export function flattenFindings(pooled, judge) {
  if (!judge || !Array.isArray(judge.groups)) {
    throw new Error("judge の出力が読めない。空グループとして先に進まない");
  }

  const byRef = new Map(pooled.map((p) => [p.ref, p]));

  return judge.groups.map((group, i) => {
    const representative = byRef.get(group.representative_ref);
    if (!representative) {
      throw new Error(`judge が知らない ref を返した: ${group.representative_ref}`);
    }
    return {
      ...representative,
      id: `F-${String(i + 1).padStart(3, "0")}`,
      agent_refs: group.agent_refs,
      agent_count: group.agent_refs.length,
      judge_note: group.judge_note ?? null,
    };
  });
}

export function writeFlat(workdir, flat) {
  writeFileSync(join(workdir, "flat-issues.json"), JSON.stringify(flat, null, 2), "utf8");

  const dir = join(workdir, "flat-issues");
  mkdirSync(dir, { recursive: true });
  for (const finding of flat) {
    writeFileSync(join(dir, `${finding.id}.json`), JSON.stringify(finding, null, 2), "utf8");
  }
}
