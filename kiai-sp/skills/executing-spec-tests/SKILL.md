---
name: executing-spec-tests
description: generating-spec-tests が作った台帳を上から逐次消化し、結果と証跡を残す。全件消化しきってから終わる。テスト対象コードの修正はしない。単体は 1 体 10 件バッチ、結合と E2E は 1 ケース 1 体で回す。
---

## 起動時に伝えること

「台帳を上から消化する Workflow を起動します。単体は 1 体 10 件、結合と E2E は 1 ケース 1 体で消化します。すべて消化しきってから納品に進みます。」

## 手順

親スキルが持つ Phase は 3 つだけである。実消化ループ (Phase 1〜5) は Workflow スクリプトが持つ。

| Phase | 内容 | 詳細 |
|---|---|---|
| 0 | 準備 (成果物ディレクトリの解決・依存確認) | `references/phase-0-prepare.md` |
| — | Workflow の起動と完了待ち | `references/workflow-invocation.md` |
| 6 | 納品 (アーティファクトのコミットと PR 作成) | `references/phase-6-deliver.md` |

各 Phase に入る直前に、対応する reference を Read する。

## このスキルがやらないこと

- **完走したかどうかの判定。** 台帳と検査スクリプトとゲートが決める
- **テストケースの生成。** `generating-spec-tests` の仕事
- **テスト対象コードの修正。** FAIL は記録して次へ進む
- **対象外の新規作成。** 実行できなかったものは `error`

## 設定値のつまみ

つまみは 2 つのみ。

- 単体のまとまり件数 (`UNIT_BATCH_SIZE`, 初期値 10)。1 にすると 1 ケース 1 体になる
- 役割別モデル

数値はすべて `kiai-sp/lib/spec-testing/constants.mjs` に集約されている。SKILL.md から数値を書き換えない。

## 残る穴 (実装最初に確かめる項目)

以下は本 spec では塞がらない。実装後に実挙動を見てから別 spec を立てる。

- **Workflow 実行中は完走ゲートが検査を保留する。** workflow が黙って死ぬと「残件があるのに正常終了した」を検出できない
- **ガード/ゲートの装填がセッション単位。** workflow 子で失効するとガードがまるごと消える (実装最初にテストで確かめる)
