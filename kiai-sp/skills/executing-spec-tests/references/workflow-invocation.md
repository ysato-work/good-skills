# Workflow 起動と完了待ち

## 起動

Workflow ツールを次の引数で呼ぶ。

```json
{
  "scriptPath": "kiai-sp/skills/executing-spec-tests/workflow.mjs",
  "args": {
    "artifact_dir": "<Phase 0 で解決した absolute path>",
    "now": "<ISO8601 の現在時刻。親が生成して渡す>"
  }
}
```

`args.now` は親が渡す。workflow スクリプト内では `Date.now()` / `new Date()` を呼ばない (Dynamic Workflow の制約)。

## 完了待ち

Workflow ツールは受付番号を返すだけで、実処理はバックグラウンドで走る。完了通知が来るまでターンを終えない。

完了通知が来たら、`<artifact_dir>/cases.tsv` の状態を確認する。todo が 0 件で fail/error のみが残るのが正常な完了。

## 完了通知が来ないままターンが進んだ場合

Workflow の受付番号を `<artifact_dir>/../.workflow-run.json` に記録しておく。次のターンで受付番号を見て、通知が失われていないかを判定する。

## 起動時のユーザー確認プロンプト

Workflow ツールは起動時にユーザー確認を求める。CI 経路 (人間非介在) では通らない可能性がある。Task 1 の実挙動確認結果に従って扱いを決める。
