# executing-spec-tests — 共通定義

## 変数

| 変数 | 意味 | 解決タイミング |
|---|---|---|
| `<skill_dir>` | このスキルの絶対パス | Phase 0 冒頭 |
| `<repo_root>` | 検証対象リポジトリのルート | Phase 0 冒頭 |
| `<spec_path>` | 検証する設計書のパス | 起動引数 |
| `<artifact_dir>` | `<repo_root>/docs/superpowers/testing/<spec 名ベース>/` | Phase 0 冒頭 |
| `<level>` | 今消化しているレベル | Phase 1 |

`<artifact_dir>` は自分で組み立てず、`kiai-sp/lib/spec-testing/paths.mjs` の
`artifactDir(repoRoot, specPath)` を呼んで得る。

## ファイル

| ファイル | 誰が書くか |
|---|---|
| `<artifact_dir>/cases.tsv` | 生成時に確定。実施では状態の列だけ動く |
| `<artifact_dir>/requirements.tsv` | 生成時に確定。実施では触らない |
| `<artifact_dir>/evidence/<case_id>/commands.md` | 子 |
| `<artifact_dir>/evidence/<case_id>/<N>-<slug>.log` | 子 |
| `<artifact_dir>/evidence/<case_id>/fixtures/` | 子 |
| `<artifact_dir>/progress.json` | 検査スクリプト |

実施で動く列は `status` / `attempts` / `evidence_path` / `test_code_path` /
`updated_at` の 5 つだけ。ケースの内容そのものは変わらない。

## 定数

コードから読む。この文書に数値を写さない。

| 定数 | どこにあるか |
|---|---|
| 試行上限 | `kiai-sp/lib/spec-testing/constants.mjs` の `MAX_ATTEMPTS` |
| ログのサイズ上限 | 同 `LOG_FILE_MAX_BYTES` / `CASE_LOG_TOTAL_MAX_BYTES` |

## エージェント

| label | subagent_type | model |
|---|---|---|
| case-runner | `kiai-sp:executing-spec-tests:case-runner` | sonnet |

定義は `kiai-sp/agents/executing-spec-tests/case-runner.md` にある。Phase 0 冒頭で
存在を確認し、無ければエラーで停止する。

## 依存ツール

- `node`。Phase 0 冒頭で `node --version` を確認し、失敗ならエラー停止
- Read / Write / Edit / Bash / Agent

## 参照する外部の文書

- `kiai-sp/lib/spec-testing/DATA-CONTRACT.md` — 台帳の形。Phase 0 で読む
- `kiai-sp/lib/spec-testing/TIERS.md` — 環境の 3 階層。Phase 1 で読む

## 横断制約

- **台帳の行を飛ばさない**
- **親はテストを実行しない**
- **親はテストの生出力を読まない**
- **実施時に `out_of_scope` を作らない**
- **テスト対象コードを修正しない**
