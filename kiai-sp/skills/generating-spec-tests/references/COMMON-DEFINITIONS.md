# generating-spec-tests — 共通定義

## 変数

| 変数 | 意味 | 解決タイミング |
|---|---|---|
| `<skill_dir>` | このスキルの絶対パス | Phase 0 冒頭 |
| `<repo_root>` | 検証対象リポジトリのルート | Phase 0 冒頭 |
| `<spec_path>` | 検証する設計書のパス。1 枚以上 | 起動引数 |
| `<artifact_dir>` | `<repo_root>/docs/superpowers/testing/<spec 名ベース>/` | Phase 0 冒頭 |
| `<tmpdir>` | 一時ファイルのルート。指定があればそれ、なければ OS 一時領域 | Phase 0 冒頭 |
| `<workdir>` | `<tmpdir>/generating-spec-tests/<YYYYMMDD-HHMMSS>-<random8>/` | Phase 0 冒頭 |
| `<iter>` | 現在の周回数。1 から始まる | Phase 1 |

`<artifact_dir>` は自分で組み立てず、`node -e` で
`kiai-sp/lib/spec-testing/paths.mjs` の `artifactDir(repoRoot, specPath)` を呼んで得る。

## ファイル

| ファイル | 生成 Phase | 消費 Phase |
|---|---|---|
| `<workdir>/requirements.json` | 0 | 2 |
| `<workdir>/cases.json` | 0, 6 | 1, 6, 8 |
| `<workdir>/chunks/chunk-NNN.json` | 1 | 2 |
| `<workdir>/chunks/whole.json` | 1 | 2 |
| `<workdir>/results/<label>.json` | 2 | 3 |
| `<workdir>/pool.json` | 3 | 3 |
| `<workdir>/judge.json` | 3 | 3 |
| `<workdir>/flat-issues.json` | 3 | 4, 5 |
| `<workdir>/flat-issues/<id>.json` | 3 | 4 |
| `<workdir>/confidence-batches/batch-NNN.json` | 4 | 4 |
| `<workdir>/confidence/<id>.json` | 4 | 5 |
| `<workdir>/passed.json` | 5 | 6 |
| `<workdir>/dropped.json` | 5 | — |
| `<workdir>/metadata-iter-<N>.json` | 7 | 7 |
| `<artifact_dir>/cases.tsv` | 8 | executing-spec-tests |
| `<artifact_dir>/requirements.tsv` | 8 | executing-spec-tests |

## 定数

コードから読む。この文書に数値を写さない。

| 定数 | どこにあるか |
|---|---|
| チャンクサイズ | `<skill_dir>/lib/chunk-cases.mjs` の `CHUNK_SIZE` |
| 確信度の閾値 | `kiai-sp/lib/spec-testing/constants.mjs` の `CONFIDENCE_THRESHOLD` |
| 採点の試行上限 | `<skill_dir>/lib/score.mjs` の `MAX_SCORE_ATTEMPTS` |
| 周回上限 | `max_iter = 2`。spec が明示している |

## エージェント

| label | subagent_type | model |
|---|---|---|
| chunk-NNN | `kiai-sp:generating-spec-tests:case-reviewer` | haiku |
| whole | `kiai-sp:generating-spec-tests:whole-reviewer` | haiku |
| judge | `kiai-sp:generating-spec-tests:judge` | haiku |
| scorer | `kiai-sp:generating-spec-tests:confidence-scorer` | haiku |

定義は `kiai-sp/agents/generating-spec-tests/<name>.md` にある。

Phase 0 冒頭でこのディレクトリの存在を `ls` で確認する。無ければエラーで停止する。

## 依存ツール

- `node`。Phase 0 冒頭で `node --version` を確認し、失敗ならエラー停止
- Read / Write / Edit / Bash / Agent

## 参照する外部の文書

- `kiai-sp/lib/spec-testing/DATA-CONTRACT.md` — 台帳の形。Phase 0 と Phase 8 で読む
- `kiai-sp/lib/spec-testing/TIERS.md` — 環境の 3 階層。Phase 0 と Phase 2 で読む

## 横断制約

- **中間値で埋めない。** 採点が取れなければリトライし、上限を超えたらエラー停止する
- **フェーズを飛ばさない。** 指摘が 0 件でも Phase 3 から 7 は通す
- **設計書を書き換えない**
- 集計・ID 採番・チャンク化・フィルタ・終了判定は JS に任せる。親が数えない
