---
name: generating-spec-tests
description: 設計書とコードの差分からテストケースを一括で列挙し、実施前にレビュー合議で改善して台帳に書き出す。設計書どおりに実装されているかを後から検証したいときに使う。実施は executing-spec-tests が行う。
---

## 共通定義

変数・ファイル名・依存ツール・前提はすべて `references/COMMON-DEFINITIONS.md` に
集約してある。Phase 0 の冒頭で 1 度だけ Read する。

## 実行ルール

1. Phase 番号が小さいものから順に処理する
2. 各 Phase に入る直前に、対応する `references/phase-<N>-*.md` を Read する
3. 前の Phase で読んだ内容に頼らない。各 Phase では `COMMON-DEFINITIONS.md` と
   当該 Phase の reference だけを参照する
4. **フェーズを飛ばさない。** 指摘が 0 件でも Phase 3 から 7 は通す

## 起動時に伝えること

「設計書からテストケースを作ります。要件の抽出 → ケースの一括列挙 → レビュー合議
（最大 2 周）→ 台帳の書き出し、の順で進みます。実施はこのスキルでは行いません。」

## フェーズ

| Phase | 内容 | 詳細 |
|---|---|---|
| 0 | 要件の抽出とケースの一括列挙 | `references/phase-0-enumerate.md` |
| 1 | Bundle（チャンクへ割る） | `references/phase-1-bundle.md` |
| 2 | Fan-out（並列レビュー） | `references/phase-2-review.md` |
| 3 | Judge（同じ指摘のグループ化） | `references/phase-3-judge.md` |
| 4 | Score（確信度の採点） | `references/phase-4-confidence.md` |
| 5 | Filter（閾値で足切り） | `references/phase-5-filter.md` |
| 6 | Apply（ケースへの反映） | `references/phase-6-apply.md` |
| 7 | Loop（続けるか決める） | `references/phase-7-loop.md` |
| 8 | 台帳の書き出し | `references/phase-8-ledger.md` |

Phase 7 が「続ける」と判定したら Phase 1 に戻る。「止める」なら Phase 8 へ進む。

## このスキルがやらないこと

- **テストの実施。** `executing-spec-tests` の仕事
- **設計書の書き換え。** 要件は抽出して引用するだけ
- **テスト対象コードの修正**
