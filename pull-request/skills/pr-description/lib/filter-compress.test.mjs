import { test } from "node:test";
import assert from "node:assert";
import { validateShape, extractQuotes, filterFindings } from "./filter-compress.mjs";

const frames = [
  { kind: "open", title: "", text: "50 点埋めをやめた。採点できなかった候補に仮の点をつける経路を消した。" },
  { kind: "details", title: "テスト", text: "リトライの上限で確実に停止することを確認した" },
  { kind: "numbered", title: "", text: "採点できなかった候補に仮の点をつける経路" },
  { kind: "numbered", title: "", text: "閾値で足切りする経路" },
];

test("形が違う出力は throw する", () => {
  assert.throws(() => validateShape({}), /findings 配列がありません/);
  assert.throws(() => validateShape([]), /findings 配列がありません/);
  assert.throws(() => validateShape(null), /findings 配列がありません/);
});

test("findings 配列があればそれを返す", () => {
  assert.deepStrictEqual(validateShape({ findings: [] }), []);
});

test("門を全部通る指摘は残る", () => {
  const findings = [
    { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライ上限で止まること" },
  ];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 1);
  assert.deepStrictEqual(r.counts, { kept: 1, gate1: 0, gate2: 0, gate3: 0 });
});

test("門1: 引用が無い指摘を捨てる", () => {
  const findings = [{ kind: "open", title: "", quote: "", shorter: "短い案" }];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.counts.gate1, 1);
  assert.strictEqual(r.dropped[0].why, "引用が無い");
});

test("門1: 名指しした枠が入力に無い指摘を捨てる", () => {
  const findings = [{ kind: "details", title: "存在しない枠", quote: "リトライの上限で", shorter: "リトライ上限で" }];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.counts.gate1, 1);
  assert.strictEqual(r.dropped[0].why, "指摘が名指しする枠が入力に無い");
});

test("門1: 引用がその枠の中に無い指摘を捨てる", () => {
  const findings = [{ kind: "open", title: "", quote: "リトライの上限で確実に停止する", shorter: "リトライ上限で止まる" }];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.counts.gate1, 1);
  assert.strictEqual(r.dropped[0].why, "引用が本文に無い");
});

test("門1: 同じ kind と title を共有する枠が複数あるとき、どちらかにあれば通る", () => {
  const findings = [{ kind: "numbered", title: "", quote: "閾値で足切りする経路", shorter: "閾値で足切り" }];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 1);
});

test("門2: 縮めた案が元より短くない指摘を捨てる", () => {
  const findings = [
    { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライの上限で確実に停止することを確認できた" },
  ];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.counts.gate2, 1);
  assert.strictEqual(r.dropped[0].why, "縮めた案が元より短くない");
});

test("門2: 同じ長さも捨てる", () => {
  const findings = [
    { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライの上限で確実に停止したことを確認した" },
  ];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.counts.gate2, 1);
});

test("門2: 縮めた案が無い指摘も門2で捨てる", () => {
  const findings = [{ kind: "details", title: "テスト", quote: "リトライの上限で", shorter: "" }];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.counts.gate2, 1);
  assert.strictEqual(r.dropped[0].why, "縮めた案が元より短くない");
});

test("門3: 前周回に門を通った引用への再提案を捨てる", () => {
  const findings = [
    { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライ上限で止まること" },
  ];
  const r = filterFindings(findings, frames, ["リトライの上限で確実に停止することを確認した"]);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.counts.gate3, 1);
  assert.strictEqual(r.dropped[0].why, "前周回に門を通った引用");
});

test("門3: 触るな一覧が空なら何も捨てない", () => {
  const findings = [
    { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライ上限で止まること" },
  ];
  const r = filterFindings(findings, frames, []);
  assert.strictEqual(r.counts.gate3, 0);
});

test("門3 より門1 が先に効く", () => {
  const findings = [{ kind: "open", title: "", quote: "", shorter: "短い案" }];
  const r = filterFindings(findings, frames, [""]);
  assert.strictEqual(r.counts.gate1, 1);
  assert.strictEqual(r.counts.gate3, 0);
});

test("引用を抜き出す。重複は畳む", () => {
  const parsed = {
    findings: [
      { kind: "open", title: "", quote: "50 点埋めをやめた。", shorter: "50点埋めを廃止。" },
      { kind: "numbered", title: "", quote: "50 点埋めをやめた。", shorter: "廃止した。" },
      { kind: "details", title: "テスト", quote: "リトライの上限で", shorter: "リトライ上限で" },
    ],
  };
  assert.deepStrictEqual(extractQuotes(parsed), ["50 点埋めをやめた。", "リトライの上限で"]);
});

test("引用を抜き出すとき、空の引用は入れない", () => {
  assert.deepStrictEqual(extractQuotes({ findings: [{ quote: "  " }, { quote: "残る" }] }), ["残る"]);
});

test("引用の抜き出しも形の検証を通す", () => {
  assert.throws(() => extractQuotes({}), /findings 配列がありません/);
});

test("門の出力の形（kept）からも引用を抜き出せる", () => {
  const gateOutput = {
    kept: [
      { kind: "details", title: "テスト", quote: "リトライの上限で確実に停止することを確認した", shorter: "リトライ上限で止まること" },
    ],
    dropped: [],
    counts: { kept: 1, gate1: 0, gate2: 0, gate3: 0 },
  };
  assert.deepStrictEqual(extractQuotes(gateOutput), ["リトライの上限で確実に停止することを確認した"]);
});
