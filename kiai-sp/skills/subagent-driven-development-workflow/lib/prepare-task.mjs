/**
 * prepare-task.mjs
 *
 * SDD workflow 版の親が、実装者を dispatch する直前に一度だけ実行する。
 * workspace の解決・task brief / Global Constraints の機械抽出・BASE 記録・
 * preset からのモデル解決を1コマンドにまとめる（本家の sdd-workspace /
 * task-brief を内製し、Global Constraints 抽出と preset 解決を追加したもの）。
 *
 * CLI: node prepare-task.mjs PLAN_FILE TASK_NUMBER PRESET
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePreset } from './presets.mjs';

export function resolveWorkspace(planFile) {
  if (!existsSync(planFile)) throw new Error(`no such plan file: ${planFile}`);
  const slug = basename(planFile).replace(/\.md$/, '');
  if (!slug || slug === '.' || slug === '..') {
    throw new Error(`cannot derive a workspace name from: ${planFile}`);
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const base = join(root, '.superpowers', 'sdd');
  const dir = join(base, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, '.gitignore'), '*\n');
  return dir;
}

export function extractTaskBrief(planText, taskN) {
  const lines = planText.split('\n');
  const startRe = new RegExp(`^#+\\s+Task\\s+${taskN}(?:[^0-9]|$)`);
  const anyTaskRe = /^#+\s+Task\s+\d+(?:[^0-9]|$)/;
  let inFence = false;
  let collecting = false;
  const out = [];
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && anyTaskRe.test(line)) collecting = startRe.test(line);
    if (collecting) out.push(line);
  }
  if (out.length === 0) throw new Error(`task ${taskN} not found in plan (no heading matching 'Task ${taskN}')`);
  return out.join('\n');
}

export function extractGlobalConstraints(planText) {
  const m = planText.match(/##\s+Global Constraints\n([\s\S]*?)(?=\n##\s|\n---\n)/);
  if (!m) throw new Error('Global Constraints section not found in plan');
  return m[1].trim();
}

function isMain() {
  return process.argv[1] && process.argv[1].endsWith('prepare-task.mjs');
}

if (isMain()) {
  const [planFile, taskArg, preset] = process.argv.slice(2);
  if (!planFile || !taskArg || !preset) {
    console.error('Usage: node prepare-task.mjs PLAN_FILE TASK_NUMBER PRESET');
    process.exit(2);
  }
  const taskN = Number(taskArg);
  const planText = readFileSync(planFile, 'utf8');
  const workspaceDir = resolveWorkspace(planFile);
  const briefPath = join(workspaceDir, `task-${taskN}-brief.md`);
  const constraintsPath = join(workspaceDir, `task-${taskN}-constraints.md`);
  const reportPath = join(workspaceDir, `task-${taskN}-report.md`);

  writeFileSync(briefPath, extractTaskBrief(planText, taskN));
  writeFileSync(constraintsPath, extractGlobalConstraints(planText));

  const base = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const { implementer, reviewer, escalated } = resolvePreset(preset);

  process.stdout.write(JSON.stringify({
    workspaceDir, briefPath, constraintsPath, reportPath, base,
    implementerModel: implementer, reviewerModel: reviewer, escalatedModel: escalated,
  }, null, 2) + '\n');
}
