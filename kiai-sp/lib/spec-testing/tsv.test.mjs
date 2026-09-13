import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeCell, parseTsv, serializeTsv, unescapeCell } from "./tsv.mjs";

test("escapeCell はタブと改行とバックスラッシュを潰す", () => {
  assert.equal(escapeCell("a\tb"), "a\\tb");
  assert.equal(escapeCell("a\nb"), "a\\nb");
  assert.equal(escapeCell("a\r\nb"), "a\\r\\nb");
  assert.equal(escapeCell("a\\b"), "a\\\\b");
});

test("escapeCell は null と undefined を空文字にする", () => {
  assert.equal(escapeCell(null), "");
  assert.equal(escapeCell(undefined), "");
});

test("unescapeCell は escapeCell を往復して元に戻す", () => {
  const original = "手順1\t手順2\n期待値: a\\b\r終わり";
  assert.equal(unescapeCell(escapeCell(original)), original);
});

test("unescapeCell は知らないエスケープをそのまま残す", () => {
  assert.equal(unescapeCell("a\\xb"), "a\\xb");
});

test("parseTsv はヘッダ名をキーにした行オブジェクトを返す", () => {
  const { header, rows } = parseTsv("a\tb\n1\t2\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [{ a: "1", b: "2" }]);
});

test("parseTsv は列数がヘッダと違う行を行番号付きで拒否する", () => {
  assert.throws(() => parseTsv("a\tb\n1\n"), /2 行目/);
});

test("parseTsv は行末の CR を落とす", () => {
  const { rows } = parseTsv("a\tb\r\n1\t2\r\n");
  assert.deepEqual(rows, [{ a: "1", b: "2" }]);
});

test("parseTsv は空文字を空の表として読む", () => {
  assert.deepEqual(parseTsv(""), { header: [], rows: [] });
});

test("serializeTsv と parseTsv はタブと改行入りのセルを往復できる", () => {
  const header = ["id", "steps"];
  const rows = [{ id: "T-001", steps: "1. 立てる\n2. 叩く\tHTTP" }];
  const round = parseTsv(serializeTsv(header, rows));
  assert.deepEqual(round.rows, rows);
});

test("serializeTsv はヘッダの順にセルを並べる", () => {
  const out = serializeTsv(["b", "a"], [{ a: "1", b: "2" }]);
  assert.equal(out, "b\ta\n2\t1\n");
});
