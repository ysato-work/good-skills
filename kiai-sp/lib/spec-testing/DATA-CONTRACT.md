# テスト台帳と証跡のデータ契約

S2 から S6 のスキルはこの契約に従う。列や状態を増やすときは、まずこの文書と
`ledger.mjs` を直し、`ledger.test.mjs` を通してから各スキルを直す。

設計の根拠は `docs/superpowers/specs/2026-08-31-テスト台帳と証跡のデータ契約-design.md`。

## 置き場

成果物は**検証対象リポジトリ**に置く。スキル側のリポジトリには一切持ち込まない。

```
docs/superpowers/testing/<spec 名ベース>/
|-- cases.tsv          # 唯一の正
|-- requirements.tsv   # 設計書の要件を抽出して ID を採番したもの
|-- evidence/
|     `-- T-001/
|           |-- commands.md
|           |-- 1-<slug>.log
|           |-- 2-<slug>.png
|           `-- fixtures/
|-- progress.json      # 検査スクリプトが生成する集計
|-- progress.prev.json # 前ターンの集計
`-- report.md
```

パスの組み立ては手で書かず `paths.mjs` を使う。

## cases.tsv

15 列。順序は `ledger.mjs` の `CASE_COLUMNS` が正。

| 列 | 内容 |
|---|---|
| `case_id` | `T-001` 形式。生成後に不変 |
| `level` | `unit` / `integration` / `e2e`。表はこの順に並べる。グループ単位ではなく、ファイル全体を通してのグローバルな非減少順。一度 `integration` まで進んだら、以降のどの行も `unit` に戻れない |
| `req_ids` | 検証する要件 ID。カンマ区切り |
| `technique` | 境界値 / 異常系 / 状態遷移 / 同値分割 / ペアワイズ |
| `box` | `white` / `black` |
| `title` | 1 行の要約 |
| `preconditions` | 前提条件 |
| `steps` | 手順 |
| `expected` | 期待結果 |
| `status` | `todo` / `pass` / `fail` / `out_of_scope` / `error` |
| `out_of_scope_reason` | `out_of_scope` のときだけ必須。それ以外は空 |
| `attempts` | 実行を試みた回数。初期値 0 |
| `evidence_path` | `evidence/T-001/`。未実行なら空 |
| `test_code_path` | テストコードとして実装した場合のプロダクトコード側のパス。レベルを問わない |
| `updated_at` | ISO 8601。未更新なら空 |

セル内のタブと改行は `tsv.mjs` がエスケープする。生で書かない。

### status を潰さない

- `fail` は「テスト対象に不具合があった」。`error` は「テストを実行できなかった」。
  無人実行でこの 2 つを同じ値にすると区別が永久に失われる
- `out_of_scope` は「AI が実行できないと判断した」。`todo` とは別物
- `running` は持たない。中断時に実行中だった行は `todo` のまま残り、再開すると
  再実行されて冪等になる

## requirements.tsv

5 列。`REQUIREMENT_COLUMNS` が正。設計書自体は書き換えない。

| 列 | 内容 |
|---|---|
| `req_id` | `R-001` 形式 |
| `spec_section` | 設計書中の見出しパス |
| `quote` | 設計書からの原文引用。改変禁止 |
| `testable` | `yes` / `no` |
| `untestable_reason` | `no` のときだけ必須 |

`testable` が `no` の要件は被覆判定から外れる。テストしなくてよいと明示的に
許されている範囲なので、被覆されないこと自体は失敗ではない。

## 進捗の検査

```bash
node kiai-sp/lib/spec-testing/check-progress.mjs --dir <成果物ディレクトリ> --phase generation
node kiai-sp/lib/spec-testing/check-progress.mjs --dir <成果物ディレクトリ> --phase execution
```

| フェーズ | 完了条件 |
|---|---|
| 生成 | `uncovered_req_ids` が空 |
| 実施 | `todo` が 0 |

| 終了コード | 意味 |
|---|---|
| `0` | 完了 |
| `1` | 未完。`reasons` に理由が入る |
| `2` | 検査できなかった。台帳が無い、ヘッダが違う、契約違反がある |

`fail` が残っていても実施フェーズは完了とする。FAIL の修正はこのスキル群の
スコープ外。

**完走の判定はここだけが行う。** ゲートも CI も、この終了コードをそのまま使う。
別の基準を作らない。

`check-progress.mjs` の stderr は人間が読むための自由形式テキストである。
S2〜S6 のどのスキルもこれをパースしてはいけない。exit code 2 は無条件に
致命的エラーとして扱い、メッセージの文言や内容で分岐する処理を書かない。

## 調整する定数

`constants.mjs` の 1 箇所だけに定義してある。どれも初期値であり、実際に走らせて
調整する。spec 本文や各スキルに数値を写さない。

`constants.test.mjs` が定数どうしの関係を守る。閾値は 50 超、連続ブロックの上限は
8 未満。ここを崩す変更はテストが落ちる。
