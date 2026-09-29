# Phase 0 — 前提確認

## 手順

1. `SKILL_DIR` / `PROJECT_ROOT` / `TMP_BASE` を解決する
2. `MODE` を確定する
   - `--serious` と `--light` の両方が指定されていたらエラーで停止する。理由は「両方指定は不可」である
   - `--serious` が指定されていれば `serious` に確定する。自動判定はスキップする
   - `--light` が指定されていれば `light` に確定する。自動判定はスキップする
   - どちらも指定されていない場合は、手順 11 で base を確定してから
     下記「MODE の自動判定」で親自身が diff を見て決める
   - 決めた MODE を `<WORKDIR>/level.txt` に 1 行で保存する。Phase 5 はこのファイルを Read して分岐する。**記憶で判断しない。**
   - 判定経路と結果を、手順 3 の起動時概要に出力する
     例: "docs 更新中心なので light"、"ハンドラーにロジック追加なので serious"、"明示指定で serious"、"明示指定で light"
3. 所要時間を伝える。軽量モードは数分、本気モードは別の目でのレビューと語り口判定と圧縮が入るのでそれ以上である。**手順 2 で MODE が未確定のまま進んだ場合、この出力は手順 11 のあとの「MODE の自動判定」まで待つ**
4. `MODE_UPSERT` を確定する。手順は下記のとおり
5. `YYYYMMDD-hhmmss` 形式の今回の実行 ID (`RUN_ID`) の値を決める
6. `WORKDIR` を決めて `mkdir -p` する。手順は下記のとおりで、モードで分岐する
7. 実行 ID を `<WORKDIR>/run-id` に書き出す。手順は下記のとおり
8. 投稿経路の到達性を確認する。手順は下記のとおり
9. PR の状態を保存する。手順は下記のとおり
10. 既存本文の状態を判定し、**必ず** `<WORKDIR>/body-state.json` を書く。手順は下記のとおり。判定をスキップする場合でもファイルは書く。**書かずに済ませない。** Phase 3 と Phase 7 がこのファイルを Read する
    - `create` モード: 判定しない。`{"state":"create","last_ai_edit":null,"reason":null,"broken":false}` を書く。**`--overwrite` が同時に指定されていても create モードが優先される。`--overwrite` は無視する**。元から本文が無いためである。無視した旨は Phase 7 の報告に出す
    - `edit` モードで `--overwrite` が指定されている: 判定しない。`{"state":"overwrite","last_ai_edit":null,"reason":null,"broken":false}` を書く
    - `edit` モードで `--overwrite` が無い: 下記の判定を行って書く
11. base ブランチを解決し、未 push なら push する。create モードのみで行う。手順は下記のとおり。**手順 2 で MODE が未確定のままならここに続けて「MODE の自動判定」を行う**

## MODE_UPSERT の確定

判定順:

1. `--pr=<番号>` が明示されている
   - 指定された番号の PR を取得できれば `edit` モードで進み、`PR_NUMBER` に採用する
   - 取得できなければエラーで停止する。理由は「指定した PR が見つからない」である
2. `--pr` が省略されている
   - 現ブランチに紐づく PR を、GitHub MCP か `gh pr view --json number` で検索する
   - 見つかれば `edit` モードで進み、番号を `PR_NUMBER` に採用する
   - 見つからなければ `create` モードで進み、`PR_NUMBER` はこの時点では確定しない。Phase 7 で `gh pr create` の URL から取り出す

決めた値を `<WORKDIR>/mode.txt` に `edit` または `create` の 1 行で保存する。Phase 3 / 4 / 7 はこのファイルを Read して分岐する。**記憶で判断しない。**

## 実行 ID

今回の実行を `YYYYMMDD-hhmmss` の実行 ID (`RUN_ID`) で識別する。`create` モードの `WORKDIR` パスは `RUN_ID` を含むため、手順 5 の値の決定は手順 6 の `WORKDIR` の決定より先に行う。手順 7 の `WORKDIR/run-id` への書き出しは `WORKDIR` が存在してからでないとできないため、この 2 つは分離する。

手順 5: 値を決める。この時点ではまだ `WORKDIR` が無い。

```bash
date +%Y%m%d-%H%M%S
```

出力された値を `<RUN_ID>` として覚えておく。`create` モードでは手順 6 の `WORKDIR` パスにこの値をそのまま使う。

手順 7: `WORKDIR` を決定して `mkdir -p` した後に書き出す。手順 5 で決めた `<RUN_ID>` を使い、ここで `date` を再実行しない。

```bash
echo "<RUN_ID>" > <WORKDIR>/run-id
mkdir -p "<WORKDIR>/ledger/$(cat <WORKDIR>/run-id)"
```

Phase 6 の台帳は `WORKDIR/ledger/<実行 ID>/iter-<N>.json` に置く。`WORKDIR` は PR 単位なので、実行 ID でディレクトリを分けないと 2 回目の実行の `iter-1` が前回を消す。**前回の台帳は消さない。** Phase 6 で読み直す。

ループ判定（`loop-decide.mjs`）はこの `run-id` を読んで、今回の実行のディレクトリだけを数える。

## WORKDIR のモード別配置

| MODE_UPSERT | `WORKDIR` |
|---|---|
| `edit` | `<TMP_BASE>/pr-description/PR<PR_NUMBER>` |
| `create` | `<TMP_BASE>/pr-description/PR-new-<RUN_ID>` |

`create` モードでは PR 番号がまだ無いため、`RUN_ID` を使った仮置きにする。Phase 7 で `gh pr create` が返した URL から番号を抜き取り、`<WORKDIR>/pr-state.json` に確定する。**ディレクトリのリネームはしない。** 台帳と参照が壊れる。番号は `pr-state.json` で辿れれば十分。

## 投稿経路の到達性確認

**書き込みでは試さない。** 副作用が出る。読み取り専用の呼び出しを 1 回だけ使う。

モードで対象が変わる。`edit` モードでは対象 PR の取得を到達性確認に使う。従来どおりである。`create` モードではまだ PR が無いため、`gh repo view --json defaultBranchRef` を到達性確認に使う。この呼び出しは default branch の取得を兼ねる。後述の「base ブランチと push」セクションがこの値を再利用するので、`create` モードで `gh repo view` を 2 回呼んではいけない。

1. `edit` モード: GitHub MCP で対象 PR を取得できるか試す／`create` モード: GitHub MCP で `gh repo view` 相当を試す。これはリポジトリのデフォルトブランチを取得する操作である。**できればこれを使う。サンドボックスの話は出ない**
2. できなければ `gh` を試す。サンドボックス内で読み取りを 1 回だけ行う
3. `gh` も失敗したら**理由を分類しない。** 「サンドボックスを超えて接続テストを 1 回だけ実行します」と宣言し、超えて同じ読み取りを 1 回だけ実行する
4. サンドボックス内で失敗し外で成功したときだけ、投稿も超えて実行すると決める。両方同じ結果なら超えても無駄なので、GitHub には何もしないと決める
5. サンドボックスを超える権限が下りなかったら、そこで終了する。「サンドボックスを超える権限が下りなかった」と伝え、生成物を `WORKDIR` に残す

原因を分類しない理由は、認証エラーもサンドボックス由来になり得るため。トークンがサンドボックスの外にあれば、内側では読めずに認証エラーになる。HTTP ステータスでも切れない。401 は「認証が無い」とも「トークンが読めない」とも読めるからである。

決めた経路を `WORKDIR/route.json` に `{"route": "mcp"|"gh"|"gh-unsandboxed"|"none"}` として残す。`create` モードでこの呼び出しで取得できた default branch の値は、`--base=<ブランチ>` が省略されている場合に「base ブランチと push」セクションが再利用する。取得できた値を覚えておき、後述のセクションで `gh repo view` を再度呼ばない。

`edit` モードでこの呼び出しが取得した対象 PR の base ブランチ（`baseRefName`）は、手順 2 で MODE が未確定だった場合に「MODE の自動判定」が base として再利用する。取り直さない。取得できていなければ、そのときになって `WORKDIR/route.json` の `route` が示す経路で改めて取る。`gh` 経路なら `gh pr view <PR_NUMBER> --json baseRefName --jq .baseRefName`。素の `gh` を無条件に叩かない。`route` が `gh-unsandboxed` ならサンドボックスを超えて同じコマンドを実行する。サンドボックス内の `gh` には戻らない。

## PR の状態を保存する

決めた経路で PR のレビュー有無を読み取り、`WORKDIR/pr-state.json` に残す。

```json
{"has_review": false}
```

`has_review` は、**この PR に人間または他のレビュワーのレビューが 1 件でも付いているか**。GitHub MCP なら PR のレビュー一覧、`gh` なら `gh pr view <PR_NUMBER> --json reviews` で取る。空配列なら `false`。

Phase 3 の番号コメントの投稿条件と、Phase 7 の前回コメントの削除手順がこの値で分岐する。**Phase 3 で記憶から判断しない。** ここで取ってファイルに残す。

`create` モードでは PR がまだ無いので `{"has_review": false}` を書く。経路が `none` で読み取れなかった場合も `false` を書き、読めなかったことを報告する。

## 既存本文の状態判定

**取得も判定もスクリプトに任せる。目視でやらない。手で `gh` や GitHub MCP を叩いて本文を取らない。**

```bash
node <SKILL_DIR>/lib/fetch-body.mjs --pr <PR_NUMBER> --out <WORKDIR>/current-body.md && \
  node <SKILL_DIR>/lib/body-marker.mjs state --body-file <WORKDIR>/current-body.md
```

**2 つを `&&` で繋ぐ。** 取得に失敗すると `current-body.md` は書かれないので、繋がずに並べると判定側が存在しないファイルを読んで落ちる。`unknown` を作る前に死ぬ。

印は HTML のコメントである。HTML コメントを落として返す経路で取ると印が消えて見え、スキルが書いた本文を「人が書いた本文」と誤判定する。誤判定すると実行のたびに同じ説明文が積み上がる。**だから経路は取得スクリプトの中に固定してある。** 別の経路で取り直さない。

`WORKDIR/route.json` の `route` が `gh-unsandboxed` のときは、この 2 つのコマンドもサンドボックスを超えて実行する。サンドボックス内の `gh` に戻らない。

取得スクリプトが `{"ok":false,...}` を返したら、本文は取れていない。`state` を `unknown` として扱い、`reason` にスクリプトが返した理由を入れる。**別の経路で取り直さない。**

**取得スクリプトは `route.json` の `route` が `mcp` でも `gh` を使う。** 経路はスクリプトの中に固定してあり、呼び出し側は選べない。そのため `gh` が使えない環境では毎回 `unknown` になり、Phase 7 で毎回人に聞くことになる。なぜ毎回聞かれるのかが分かるよう、`unknown` になったときは `reason` をそのまま人に伝える。

判定結果を `<WORKDIR>/body-state.json` に書く。Phase 7 はこのファイルを Read して分岐する。**記憶で判断しない。**

```json
{"state": "matches", "last_ai_edit": "2026-09-14T00:00:00Z", "reason": null, "broken": false}
```

`broken` は判定スクリプトの `state` サブコマンドが返した値をそのまま入れる。判定をスキップした場合と、本文を取得できなかった場合も `false` を入れる。前者の `state` は `create` か `overwrite`、後者は `unknown` である。

`state` の読み方:

| `state` | 意味 | Phase 7 での扱い |
|---|---|---|
| `matches` | スキルが書いたまま | 囲みの中だけを差し替える。確認を取らない |
| `no_marker` | スキル以外が書いた本文 | 本文を残し、区切り線を挟んで下に囲みを作る。確認を取らない |
| `mismatch` | 囲みの中が手直しされている、または印が壊れている | **更新しない。** 理由を伝えて人に聞く。`broken` で聞き方が変わる |
| `unknown` | 本文を取得できなかった | **更新しない。** 既存本文が全部消えることを伝えて人に聞く |
| `overwrite` | `--overwrite` が指定された | 本文を捨てて新しい囲みだけにする。タイトルも書き換える |
| `create` | 新規作成 | 新規作成として本文とタイトルをセットする |

`create` モードでは本文が存在しないため、この判定をスキップして `state` を `create` にする。タイトルもこのスキルがセットする。Phase 3 と Phase 7 で行う。`edit` モードで `--overwrite` が無い場合は、既存 PR のタイトルを触らない。

## base ブランチと push

`MODE_UPSERT` が `create` のときに実行する。`edit` モードではスキップする。

1. base ブランチを確定する
   - `--base=<ブランチ>` が指定されていればその値を採用する
   - 省略されていれば、Phase 0 の到達性確認で取得した default branch を再利用する。これは重複 API 呼び出しを避けるためである。値を取り忘れていた場合のみ `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で改めて取得する
   - 決めた値を `<WORKDIR>/base.txt` に 1 行で保存する
2. 現ブランチが未 push なら push する
   - `git rev-parse --abbrev-ref --symbolic-full-name @{u}` が失敗する、または `git status -sb` の先頭行に `no upstream` の表示があれば未 push
   - 未 push なら `git push -u origin HEAD` を実行する
   - すでに upstream がある場合は push しない。差分の push はスキル対象外であり、Phase 7 の `gh pr create` は現在の origin 側 HEAD を指す。

## MODE の自動判定

手順 2 で `--serious` / `--light` のどちらも指定されておらず MODE が未確定のまま進んだ場合、手順 11 の直後にここで確定する。base の取得元はモードで異なる。

- `create` モード: 直前の「base ブランチと push」で確定した `<WORKDIR>/base.txt` を Read する
- `edit` モード: 「base ブランチと push」はスキップされているので、投稿経路の到達性確認で取得済みの対象 PR の base ブランチ（`baseRefName`）を使う。取り直さない

親自身が `git diff --stat <base>...HEAD` を実行し、変更ファイル一覧と行数を見て判定する。--stat だけで判断がつかなければ、疑わしい範囲だけ `git diff <base>...HEAD -- <path>` で中身を確認する。**記憶や体感で判断しない。必ず diff を見る。**

判定基準は次のとおりである。軸は「後から他人が diff だけ見て意図を誤解すると困るか」で、ここでいう他人にはレビュアー・未来の自分・監査が入る。

- `serious`: 次のいずれかに当てはまる
  - 本番挙動・ユーザー体験・データ・セキュリティ・API 契約のいずれかを変える
  - なぜこの実装にしたかが diff から自明でない。判断の背景説明が要る
  - 変更が複数ファイル・複数意図に散っていて、全体像を言葉で束ねないと読み手が迷子になる
- `light`: 次のいずれかで完結している
  - タイポ・formatting・コメントだけ
  - docs だけ。それ自体が説明になっている
  - テスト追加だけ。テストが仕様を語る
  - 1〜2 行の小変更で意図が diff から自明。ガード追加・依存バージョン bump などがこれに当たる
- 判断がつかないときは `serious` に倒す

決めた `mode` を `MODE` として採用し `<WORKDIR>/level.txt` に 1 行で保存する。Phase 5 はこのファイルを Read して分岐する。手順 3 で保留していた所要時間の案内と、判定結果・根拠をここで伝える。例: "docs 更新中心なので light"、"handler にバリデーション追加なので serious"。
