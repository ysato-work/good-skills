/**
 * SDD workflow の preset 正本。workflow.mjs にはこのファイルの中身がコード生成で
 * 埋め込まれる（`// --- presets (generated from lib/presets.mjs — do not edit) ---`）。
 * 埋め込みブロックはこのファイルと逐語一致でなければならない（同期チェックは
 * workflow.mjs のテストで行う）。このファイル自体には import/export 以外の
 * ランタイム依存を持たせない。
 */

export const PRESETS = {
  transcribe: { implementer: 'haiku', reviewer: 'sonnet', escalated: 'sonnet' },
  standard: { implementer: 'sonnet', reviewer: 'sonnet', escalated: 'opus' },
  design: { implementer: 'opus', reviewer: 'opus', escalated: 'opus' },
};

export const FINAL_REVIEW_MODEL = 'opus';

export function resolvePreset(preset) {
  const p = PRESETS[preset];
  if (!p) {
    throw new Error(`unknown preset: ${preset} (expected one of: ${Object.keys(PRESETS).join(', ')})`);
  }
  return { ...p };
}
