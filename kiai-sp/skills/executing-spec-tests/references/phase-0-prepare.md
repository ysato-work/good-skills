# Phase 0: 準備

## 事前確認

1. `node --version` が通ること
2. `kiai-sp/agents/executing-spec-tests/batch-runner.md` があること
3. `<artifact_dir>/cases.tsv` と `requirements.tsv` があること

どれか欠けたらエラーで停止する。

`kiai-sp/lib/spec-testing/DATA-CONTRACT.md` を読む。

中断からの再開なら、消化済みの行はそのまま残っている。`todo` に戻っている行だけが
再実行される。**済んだ行を消化し直さない。** 台帳の中身は Workflow が起動後に
ledger-reader で読むので、Phase 0 では確認しない。

## 目標条件を立てる（対話実行のときだけ）

ターン終了フックとは別に、目標条件でも継続させる。二重に効かせることで、片方が
想定外の挙動をしてももう片方が残る。

条件は「`<artifact_dir>/cases.tsv` の todo が 0 件になっていること」。

CI 実行では目標条件が使えないので設定しない。フックだけが頼りになる。

ゲートの詳しい挙動は `kiai-sp/lib/spec-testing/COMPLETION-GATE.md` にある。
詰まって降りた場合は `<artifact_dir>/stop-report.json` が残る。

## ユーザーに伝えること

進捗の 1 行と、レベルごとの件数だけ。台帳の中身を展開しない。

## Phase 0 が終わったら

`references/workflow-invocation.md` を Read して、Workflow ツールで消化ループを起動する。
