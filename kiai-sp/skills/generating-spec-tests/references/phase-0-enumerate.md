# Phase 0: 要件の抽出とテストケースの一括列挙

## 事前確認

1. `node --version` が通ること
2. `kiai-sp/agents/generating-spec-tests/` に 4 体の定義があること
3. `<spec_path>` が存在すること

どれか欠けたらエラーで停止する。

## 0.1 要件の抽出と採番

`<spec_path>` を読み、要件を抽出して `R-001` から採番する。

- **原文をそのまま `quote` に残す。** 要約しない
- `spec_section` に見出しパスを入れる（例: `決定事項 > 3 番目の箇条書き`）
- **設計書自体は書き換えない**

`testable` を判定する。次のものは `no` にして `untestable_reason` を書く。

- 人間の目視確認が本質的に必要
- 実機や実環境が必須で用意できない

`kiai-sp/lib/spec-testing/TIERS.md` を読んでから判定する。**Tier 2 で立てられる
環境が要るだけのものを `no` にしない。**

結果を `<workdir>/requirements.json` に書く。

## 0.2 差分の取得

検証対象ブランチと分岐元の差分を見る。分岐元は分岐点から機械的に求める。

```bash
git merge-base HEAD "$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo origin/HEAD)"
```

**分岐元を推測しない。** 求まらなければエラーで停止し、引数で受け取る。

## 0.3 テストケースの一括列挙

要件と差分を突き合わせ、**全レベル分のケースを一度に列挙する。** レベルごとに
分けて生成しない。全件揃っていないと Phase 2 の全体レビュアが被覆を判定できない。

観点は既製の技法を使う。境界値、同値分割、異常系、状態遷移、ペアワイズ。

`level` の割り当て:

- 外部依存なしで検証できる → `unit`。**単体を第一選択にする**
- データベースや複数コンポーネントの結合が要る → `integration`
- 画面越しでないと確認できない → `e2e`

各ケースに、検証する要件の ID を **1 件以上** 紐づける。紐づかないケースは作らない。

Tier 3 に当たるものは `status` を `out_of_scope` にし、`out_of_scope_reason` を書く。

結果を `<workdir>/cases.json` に書く。この時点では `case_id` を振らない。Phase 8 で
並べ切ってから採番する。

## 完了条件

- `<workdir>/requirements.json` と `<workdir>/cases.json` が存在する
- すべてのケースに `req_ids` が 1 件以上ある
