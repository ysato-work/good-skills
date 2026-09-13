/**
 * tsv.mjs
 *
 * テスト台帳の TSV を読み書きする。
 *
 * セル内のタブと改行はエスケープする。TSV は行と列を制御文字だけで区切るので、
 * 値に生のタブや改行が混ざると行構造が壊れる。テストケースの steps や expected は
 * 複数行になるのが普通なので、これは例外ではなく常態である。壊れた台帳は無人実行
 * では誰にも気づかれないまま進むため、エスケープを読み書きの両端でここに閉じ込める。
 *
 * 列数がヘッダと合わない行は黙って埋めずに throw する。欠けた列を空文字で埋めると、
 * 壊れた台帳が「値が空なだけの正常な台帳」として通ってしまう。
 *
 * export:
 *   escapeCell(value)          → エスケープ済みの文字列
 *   unescapeCell(text)         → 元の文字列
 *   parseTsv(text)             → { header, rows }
 *   serializeTsv(header, rows) → TSV 文字列
 */

const ESCAPES = { "\\": "\\\\", "\t": "\\t", "\n": "\\n", "\r": "\\r" };
const UNESCAPES = { "\\": "\\", t: "\t", n: "\n", r: "\r" };

export function escapeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\\\t\n\r]/g, (c) => ESCAPES[c]);
}

export function unescapeCell(text) {
  return String(text).replace(/\\(.)/g, (whole, c) =>
    Object.prototype.hasOwnProperty.call(UNESCAPES, c) ? UNESCAPES[c] : whole,
  );
}

export function parseTsv(text) {
  const lines = String(text).split("\n").map((line) => line.replace(/\r$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return { header: [], rows: [] };

  const header = lines[0].split("\t").map(unescapeCell);
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split("\t");
    if (cells.length !== header.length) {
      throw new Error(
        `TSV の ${i + 2} 行目の列数が ${cells.length} で、ヘッダの ${header.length} と違う`,
      );
    }
    return Object.fromEntries(header.map((key, j) => [key, unescapeCell(cells[j])]));
  });
  return { header, rows };
}

export function serializeTsv(header, rows) {
  const lines = [header.map(escapeCell).join("\t")];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCell(row[key])).join("\t"));
  }
  return `${lines.join("\n")}\n`;
}
