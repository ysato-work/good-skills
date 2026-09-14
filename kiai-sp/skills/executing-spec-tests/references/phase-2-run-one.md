# Phase 2: 1 件消化

## 次の行を選ぶ

```bash
node -e '
Promise.all([
  import("<skill_dir>/lib/next-case.mjs"),
  import("kiai-sp/lib/spec-testing/ledger.mjs"),
  import("kiai-sp/lib/spec-testing/paths.mjs"),
]).then(([next, ledger, paths]) => {
  const rows = ledger.readCases(paths.casesPath("<artifact_dir>"));
  const sel = next.selectNext(rows);
  console.log(JSON.stringify(sel && { ...sel, row: rows[sel.index] }));
});
'
```

| 結果 | やること |
|---|---|
| `null` | Phase 4 へ |
| `action` が `exhaust` | 子を起動せず、Phase 3 で `error` として記録する |
| `action` が `run` | 下の手順で子を起動する |

## スキップは絶対に禁止

**返ってきた行を飛ばさない。** 以下はどれもスキップの言い訳にならない。

- 「これは偽陽性だろう」
- 「すでに他のケースで確認済みだ」
- 「リスクが高いのでやめておく」
- 「機械的な実行に落とせない」
- 「時間がかかりそうだ」
- 「明らかに通るはずだ」

**実施時に新しく対象外を作らない。** 対象外は生成時のレビュー合議が判定したものだけ
である。実行しようとして無理だったものは `error` であって `out_of_scope` ではない。
この区別が崩れると、対象外と未消化を区別できるという受入基準が意味を失う。

## 子を起動する

`subagent_type: kiai-sp:executing-spec-tests:case-runner`

**1 体だけ。並列にしない。** 環境を共有しているので、同時に走らせると互いの
データを踏む。

```
case_json: <選んだ行の JSON>
requirement_quotes: <その行の req_ids に対応する requirements.tsv の quote>
environment: <Phase 1 で立てた環境の接続先。unit なら「なし」>
evidence_dir: <artifact_dir>/evidence/<case_id>/
tiers_path: kiai-sp/lib/spec-testing/TIERS.md
```

**設計書の全文も差分の全体も渡さない。** プロンプトが長いほど起動が遅く高くつく。

## 子が返してきたら

`status` / `summary` / `evidence_dir` / `test_code_path` の 4 つだけを受け取る。
Phase 3 へ進む。
