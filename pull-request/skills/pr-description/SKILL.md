---
name: pr-description
description: PR の説明文と diff への行コメントを書いて投稿するときに使う。AI が書くと AI Slop になる問題を、表層はスクリプト検出・構造はセルフレビューで抑える。発動状況は 3 つ。1 つ目は PR を作った直後に説明文を書きたいとき。2 つ目は既存 PR の説明文が古くなったので追従させたいとき。3 つ目は diff に読む順序と意図のコメントを付けたいとき。
requires: pull-request/agents/pr-description/
---

# pr-description

## Step 0 — 概要を伝える

まず以下を伝えてから処理を開始する。

「PR の説明文と diff の行コメントを書いて投稿します。

軽量モードは数分、本気モードは別の目でのレビューと語り口判定と圧縮が入るのでそれ以上かかります。`--serious` / `--light` で強制上書きできます。

既存の説明文がこのスキルの書いたままなら差し替え、人が書いたものなら消さずに区切り線を挟んで下に足します。人が手直ししていたら更新せず、更新してよいか聞きます。`--overwrite` で本文もタイトルも作り直せます。」

## 共通定義

以下の変数は Phase 0 で実値に解決する。以降のすべての Phase でこれを参照する。

| 変数 | 内容 |
|---|---|
| `SKILL_DIR` | このスキルが置かれているディレクトリ。`lib/`・`references/`・`policy/` の起点である |
| `PROJECT_ROOT` | `git rev-parse --show-toplevel`。失敗時は cwd を使う |
| `TMP_BASE` | CLAUDE.md 指定 → 書き込める作業ディレクトリ `.tmp` → OS の一時領域 `$TMPDIR` の順で解決 |
| `PR_NUMBER` | 対象 PR 番号 |
| `WORKDIR` | `${TMP_BASE}/pr-description/PR${PR_NUMBER}` |
| `MODE` | `light` または `serious`。フラグ未指定時は読み違えられると困る変更かで自動判定、`--serious` / `--light` 指定時は強制上書き |
| `MODE_UPSERT` | 既存 PR ありなら `edit`、既存 PR なしなら `create`。Phase 0 で決めて `<WORKDIR>/mode.txt` に保存 |
| `BODY_STATE` | `matches` / `no_marker` / `mismatch` / `unknown` / `overwrite` / `create`。Phase 0 で決めて `<WORKDIR>/body-state.json` に保存 |
| `BASE_BRANCH` | `create` モード時の PR base ブランチ。`--base` 引数 → default branch の順に解決。`<WORKDIR>/base.txt` に保存 |

`WORKDIR` の 2 階層目は `edit` モードでは PR 番号 `PR<PR_NUMBER>`、`create` モードでは新規実行 ID `PR-new-<RUN_ID>` を使う。PR 番号がある場合は同じ PR の再実行で前回の台帳を読み直すため、番号を使う。

`WORKDIR` 直下のファイル名規約:

- `run-id` — Phase 0 で決めた今回の実行 ID。形式は `YYYYMMDD-hhmmss`
- `body.md` — 生成した本文
- `line-comments.json` — 行コメントの配列。1 件の形は `{path, line, numbered, text}` である
- `reading-order.json` — Phase 3 で比べた番号コメントの順番の案と選んだ理由。中身は `{"candidates": [{"order": [...], "stumbles": [...]}], "chosen": ..., "reason": ...}` である。番号コメントが 1 件以下のときは無い
- `material.md` — Phase 1 で集めた素材
- `route.json` — Phase 0 で決めた投稿経路
- `pr-state.json` — `create` モードで Phase 7 が作った PR の番号。中身は `{"pr_number": ...}` である。`edit` モードでは無い
- `thrust.json` — Phase 2 で確定した主眼とついで
- `current-body.md` — Phase 0 で保存した投稿前の既存本文。`create` モード・`--overwrite` 指定時・取得失敗時には無い
- `body-state.json` — Phase 0 で決めた既存本文の状態。中身は `{"state":..., "last_ai_edit":..., "reason":..., "broken":...}` である。**判定をスキップする `create` モードと `--overwrite` 指定時にも必ず書かれる**
- `mode.txt` — Phase 0 で決めた `edit` / `create` のモード
- `level.txt` — Phase 0 で決めた `MODE`。値は `light` か `serious`
- `base.txt` — `create` モード時のみ、base ブランチ名
- `generated-files.json` — Phase 3 で作った生成ファイル一覧。リポジトリの `.gitattributes` で `linguist-generated` が有効な変更ファイルのパスの配列。Phase 4 の文面検査に渡す
- `title.txt` — `create` モード、または `--overwrite` 指定時、Phase 3 で生成した PR タイトル
- `past-titles.json` — `create` モード、または `--overwrite` 指定時、タイトルを書く直前に取った過去タイトル。`gh` の JSON をそのまま入れる。取れないときはこのファイルは無い
- `review-findings.json` — Phase 5 のセルフレビューで出た指摘
- `ledger/<実行 ID>/iter-<N>.json` — 各周回の台帳。実行ごとにディレクトリを分け、前回の実行の台帳を消さない
- `ledger/<実行 ID>/slop-iter-<N>.json` — Phase 4 の表層検出の出力。周回ごとに作る。台帳と同じ実行 ID のディレクトリに置き、前回実行の同名ファイルと混ざらないようにする
- `ledger/<実行 ID>/units-iter-<N>.json` — Phase 5 の問い 1・2 用の単位配列。周回ごとに作る。台帳と同じ実行 ID のディレクトリに置く
- `ledger/<実行 ID>/decoration-iter-<N>.json` — Phase 4 の装飾の除去で消した個数。周回ごとに作る
- `ledger/<実行 ID>/frames-iter-<N>.json` — Phase 5 の語り口の判定と圧縮に渡す枠の配列。周回ごとに作る。語り口と圧縮で共用する
- `ledger/<実行 ID>/tone-iter-<N>.json` — 語り口の判定役が書いた生の結果。軽量モードでは親が判定役になる
- `ledger/<実行 ID>/tone-kept-iter-<N>.json` — 引用の門を通った後の結果。`kept` が Phase 6 で直す対象
- `ledger/<実行 ID>/compress-iter-<N>.json` — 圧縮担当が書いた生の指摘。本気モードの 1〜2 周目だけ作る
- `ledger/<実行 ID>/compress-kept-iter-<N>.json` — 門を通った後の結果。`kept` が Phase 6 で直す対象
- `ledger/<実行 ID>/compress-notouch-iter-2.json` — 圧縮担当に渡す「触ってはいけない引用」の配列。本気モードの 2 周目だけ渡す。前周回の門通過ファイルから抜き出す
- `body-stamped.md` — Phase 7 でマーカーを付けた投稿用本文。**投稿するのはこれ**。人に聞いて承諾が得られず更新を見送ったときは無い
- `posted-body.md` — Phase 7 で投稿後に読み直した本文。マーカーの確認用である。本文を更新しなかったときは無い
- `review-id.txt` — Phase 7 で投稿した review の ID。Phase 7 の投稿前に毎回削除する。今回の投稿の応答に ID が含まれていたときだけ、投稿後にできる
- `purge-comments.json` — Phase 7 で前回の行コメントを消し、レビュー本体を非表示にした結果。中身は `{"ok":..., "deleted":..., "hidden":..., "failed":..., "failures":[...]}` である。投稿前に毎回削除する。`create` モードでは無い
- `line-comments-post.json` — Phase 7 で印を付けた投稿用の行コメントとレビュー本体。中身は `{"review_body": ..., "comments": [{path, line, body}]}` である。**投稿するのはこれ**
- `nav-links.json` — Phase 7 で番号コメントに移動リンクを付けた結果。中身は `{"ok":..., "total":..., "linked":..., "failed":..., "failures":[...]}` である。投稿前に毎回削除する。番号コメントを投稿しなかったときは無い

## 対象外

- **コードを変更しない。** 差分の中身は直さない
- **コード内コメントは書かない。** 意図はコードではなく diff の行コメントに置く
- 既存 PR のタイトルは書き換えない。新規作成時と `--overwrite` 指定時のみセットする

## 引数

- `--pr=<番号>`。省略時は現在のブランチに紐づく PR を探す
- `--serious`。本気モードを強制する。既定は読み違えられると困る変更かで自動判定
- `--light`。軽量モードを強制する。自動判定を無効化する
- `--serious` と `--light` を同時指定するとエラーで停止する
- `--base=<ブランチ>`。`create` モード時のみ有効。省略時は `gh` の default branch
- `--overwrite`。`edit` モード時のみ有効。既存本文を捨てて書き直し、タイトルも書き換える。印を見ず、確認も取らない。`create` モードでは create が優先され、`--overwrite` は無視する。無視した旨は Phase 7 の報告に書く

## 実行ルール

- Phase 0 から順に処理する
- **各 Phase を実行する直前に、対応する `references/phase-*.md` を新たに Read してから実行する**。前 Phase で読んだ内容に頼らない
- 判定は必ず `lib/` のスクリプトを通す。**本文のハッシュ照合と表層検査を目視でやらない**
- **既存本文を手で取ってこない。** 取得も判定も `lib/` のスクリプトに任せる。印は HTML コメントなので、落として返す経路で取ると説明文が積み上がる
- **絵文字と太字を目視で消さない。** Phase 4 の除去スクリプトが消す
- **語り口の判定に点数を持ち込まない。** 二択だけ。足切りはスクリプトがやる
- **圧縮の指摘を目視でふるわない。** 引用が本文にあるか・縮んでいるか・前周回に出た引用かは、すべて門のスクリプトが見る
- スキップは禁止。指摘を落とす場合は理由を台帳に残す

| Phase | 参照ファイル | 概要 |
|---|---|---|
| 0 | references/phase-0.md | 前提確認・モード判定・投稿経路・既存本文の判定・base/push |
| 1 | references/phase-1.md | 素材集め |
| 2 | references/phase-2.md | 主眼の確定とついでの切り分け |
| 3 | references/phase-3.md（＋ references/ai-writing.md） | 本文と行コメントの生成 |
| 4 | references/phase-4.md | 装飾の除去・表層検出。スクリプトで行う |
| 5 | references/phase-5.md | セルフレビューは 14 問・語り口の判定・圧縮。後の 2 つは前半の周回だけ |
| 6 | references/phase-6.md | 台帳・修正・ループ判定・投稿ゲート |
| 7 | references/phase-7.md | 投稿 |
