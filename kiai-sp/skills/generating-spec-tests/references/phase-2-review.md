# Phase 2: Fan-out — 並列レビュー

## 起動方法

Phase 1 が返した `labels` の数だけ、**1 レスポンス内で並列起動する。**
Agent ツールの呼び出しを 1 レスポンスに並べること。

| label | subagent_type |
|---|---|
| `chunk-NNN` | `kiai-sp:generating-spec-tests:case-reviewer` |
| `whole` | `kiai-sp:generating-spec-tests:whole-reviewer` |

## dispatch テンプレ

`case-reviewer` へ:

```
chunk_path: <workdir>/chunks/<label>.json
requirements_path: <workdir>/requirements.json
tiers_path: kiai-sp/lib/spec-testing/TIERS.md
output_path: <workdir>/results/<label>.json
schema_path: <skill_dir>/lib/finding-schema.json
```

`whole-reviewer` へ:

```
whole_path: <workdir>/chunks/whole.json
requirements_path: <workdir>/requirements.json
output_path: <workdir>/results/whole.json
schema_path: <skill_dir>/lib/finding-schema.json
```

## 失敗の扱い

失敗の定義は 3 つ。Agent がエラーを返した / 出力ファイルが無い / JSON として読めない。

失敗した label を **最大 1 回だけ再起動する。** それでも失敗したらエラーで停止する。
**空配列を書いて先に進まない。** このパイプラインは取りこぼしが次周回で回復しない。

## 完了条件

- すべての label について `<workdir>/results/<label>.json` が JSON 配列として読める
