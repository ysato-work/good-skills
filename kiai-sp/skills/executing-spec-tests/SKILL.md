---
name: executing-spec-tests
description: generating-spec-tests が作った台帳を上から逐次消化し、結果と証跡を残す。全件消化しきってから終わる。テスト対象コードの修正はしない。
---

## 共通定義

変数・ファイル名・依存ツール・前提はすべて `references/COMMON-DEFINITIONS.md` に
集約してある。Phase 0 の冒頭で 1 度だけ Read する。

## 実行ルール

1. Phase 0 → 1 → 2 → 3 → 4 の順に進む。4 が「続ける」と判定したら 1 に戻る。「止める」なら 5 → 6 の順に進む
2. 各 Phase に入る直前に、対応する `references/phase-<N>-*.md` を Read する
3. **台帳の行を飛ばさない。** 選ぶのは `next-case.mjs` であって親ではない
4. **親はテストを実行しない。** 実行は子に委譲する
5. **親はテストの生出力を読まない。** 証跡ファイルのパスだけを扱う

## 起動時に伝えること

「台帳を上から 1 件ずつ消化します。1 ケースにつきサブエージェントを 1 体立て、
結果と証跡を台帳へ書き戻します。残りが 0 件になるまで続けます。失敗したテストの
修正はしません。」

## フェーズ

| Phase | 内容 | 詳細 |
|---|---|---|
| 0 | 準備（台帳の読み込みと確認） | `references/phase-0-prepare.md` |
| 1 | 環境（レベルの切れ目で 1 回だけ立てる） | `references/phase-1-environment.md` |
| 2 | 1 件消化（子への委譲） | `references/phase-2-run-one.md` |
| 3 | 記録（台帳への書き戻し） | `references/phase-3-record.md` |
| 4 | ループ（続けるか決める） | `references/phase-4-loop.md` |
| 5 | 後始末（環境の破棄と汚染の確認） | `references/phase-5-teardown.md` |
| 6 | 納品（アーティファクトのコミットと PR 作成） | `references/phase-6-deliver.md` |

## このスキルがやらないこと

- **完走したかどうかの判定。** 台帳と検査スクリプトとゲートが決める
- **テストケースの生成。** `generating-spec-tests` の仕事
- **テスト対象コードの修正。** FAIL は記録して次へ進む
- **対象外の新規作成。** 実行できなかったものは `error`
