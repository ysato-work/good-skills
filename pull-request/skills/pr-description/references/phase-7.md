# Phase 7 — 投稿

## 投稿用の本文を組み立てる

**必ずスクリプトで組み立てる。手で印や区切り線を書かない。**

`WORKDIR/body-state.json` の `state` を Read して分岐する。**記憶で判断しない。**

### `create` モード

`state` は `create` のときである。

```bash
node <SKILL_DIR>/lib/body-marker.mjs stamp --body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

### `edit` モードで `state` が `matches` または `no_marker`

```bash
node <SKILL_DIR>/lib/body-marker.mjs compose \
  --body-file <WORKDIR>/current-body.md \
  --new-body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

`matches` なら囲みの中だけが入れ替わる。`no_marker` なら既存本文が残り、区切り線を挟んで下に囲みができる。**どちらも確認を取らない。**

### `edit` モードで `state` が `overwrite`

```bash
node <SKILL_DIR>/lib/body-marker.mjs compose --overwrite \
  --body-file <WORKDIR>/current-body.md \
  --new-body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

既存本文は残らない。**タイトルも `WORKDIR/title.txt` で書き換える。** 明示指定がその意思表示なので、重ねて確認は取らない。

### `edit` モードで `state` が `mismatch` または `unknown`

**この時点では組み立てない。** 下記「人に聞く」へ進む。

**投稿するのは `WORKDIR/body-stamped.md`。** `body.md` を投稿すると印が付かず、次回以降の実行が「スキル以外が書いた本文」と判定して、同じ説明文を下に積み上げる。

## 人に聞く

`state` が `mismatch` または `unknown` のとき、**本文もタイトルも更新しないまま**人に聞く。聞き方は 3 つに分かれる。`body-state.json` の `state` と `broken` を Read して選ぶ。**記憶で判断しない。**

### `mismatch` で `broken` が `false`

囲みの中だけが手直しされている場合である。

次の 3 点を伝える。

1. 印はあったが囲みの中が印と一致しなかった。人が手直しした可能性がある。`body-state.json` の `last_ai_edit` が `null` でなければ「このスキルが最後に書いたのは <last_ai_edit>」も併せて伝える
2. そのため本文を更新していないこと
3. 更新してよいか。**承諾すると囲みの中だけが新しい本文に置き換わり、囲みの外は上と下ともそのまま残る**

承諾が得られたときだけ、次で組み立てて投稿する。

```bash
node <SKILL_DIR>/lib/body-marker.mjs compose \
  --body-file <WORKDIR>/current-body.md \
  --new-body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

### `mismatch` で `broken` が `true`

印そのものが壊れている場合である。

印が重複している・開始の印だけがある・印の順序が逆になっている、のいずれか。この形では囲みの上と下を正しく切り出せないため、**囲みの外を保てない。** 次の 3 点を伝える。

1. 印が壊れていること。どの形かを具体的に伝える。`last_ai_edit` が `null` でなければ併せて伝える
2. そのため本文を更新していないこと
3. **印が壊れているため囲みの外も保てない。承認すると本文は丸ごと置き換わり、いま書かれているものは全部消える。** それでよいか

**「更新してよいか」とだけ聞かない。** 消えるものを明示した上で聞く。承諾が得られたときだけ、`--overwrite` を付けて組み立てる。

```bash
node <SKILL_DIR>/lib/body-marker.mjs compose --overwrite \
  --body-file <WORKDIR>/current-body.md \
  --new-body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

### `unknown`

本文を取得できなかった場合である。

既存本文が手元に無いため、何を残すべきかを判定できない。組み立ては `--overwrite` しかなく、**このスキルが一度も読んでいない本文を消すことになる。** 次の 3 点を伝える。

1. 本文を取得できなかったこと。`body-state.json` の `reason` をそのまま伝える。
2. そのため本文を更新していないこと
3. **既存本文は全部消える。囲みの外も含む。いま PR に書かれているものは、このスキルが一度も読まないまま消える。** それでよいか

**一般的な「更新してよいか」で聞かない。** 取り返しがつかないため、失われるものを明示した上での明確な同意だけを承諾として扱う。曖昧な返事は承諾として扱わない。

```bash
node <SKILL_DIR>/lib/body-marker.mjs compose --overwrite \
  --body-file <WORKDIR>/current-body.md \
  --new-body-file <WORKDIR>/body.md > <WORKDIR>/body-stamped.md
```

### 承諾が得られなかったとき

**更新しない。** 返事が得られない実行でも同じ。このとき **`body-stamped.md` は作らない。本文もタイトルも投稿せず、投稿後の印の確認も行わない。** 生成した本文は `WORKDIR` に残し、「現在の本文はここをこう直した方がいい」という指摘として出す。行コメントの投稿は承諾の有無に関わらず通常どおり行う。

## 前回の番号コメントを消す

`WORKDIR/pr-state.json` の `has_review` が `false` で、前回の実行がこの PR に番号コメントを投稿している場合、**投稿の前に前回の自分の番号コメントを削除する。** 消さずに投稿すると新旧の番号が二重に並び、「番号順に読んでください」がどのセットを指すか分からなくなる。

1. `route.json` の経路で、この PR に付いている自分のレビューコメントを一覧する。自分はボットか実行者を指す
2. 本文が番号コメントの書式のものだけを消す。書式は先頭が `<数字>:` である。**番号なしの意図コメントは消さない。** 人間が書いたコメントも消さない
3. 削除に失敗したものがあれば、件数と理由を報告に含める。投稿自体は続ける

`has_review` が `true` のときは Phase 3 で番号コメントを作っていないので、削除もしない。既に付いたレビューの文脈が消えるため、過去の番号コメントもそのまま残す。

`--force-comments` が指定されて `has_review=true` の PR に番号コメントを投稿する場合、前回の自分の番号コメントは削除する。新旧混在を避けるためである。ただし人間や他のレビュワーのコメントは削除しない。

## 投稿する順序

`WORKDIR/route.json` の経路を使い、`WORKDIR/mode.txt` で分岐する。

### edit モード

1. **本文を先に更新する。** 投稿する中身は `WORKDIR/body-stamped.md`。`state` が `overwrite` のときは `WORKDIR/title.txt` でタイトルも更新する。それ以外ではタイトルを触らない
   - **`state` が `mismatch` / `unknown` で承諾が得られなかったときは、本文もタイトルも更新しない。** `body-stamped.md` が無いのが正常な状態であり、投稿の失敗ではない。手順 2 の印の確認も行わず、手順 3 の行コメントの投稿へ進む
2. **投稿した本文を読み直して、マーカーが乗ったことを確かめる。** 手順は下記のとおり。本文を更新しなかったときは行わない
3. **レビューを後で投稿する。** pending review を作り、行コメントを全部足してから COMMENT として 1 回 submit する
4. レビュー本体には「1 から N の番号順に読んでください」を書く。番号コメントを作っていないときは本体を空にする。レビューが既に付いている PR で、かつ `--force-comments` なしのときがこれに当たる

### create モード

1. **PR を作成する。**
   ```bash
   gh pr create \
     --base "$(cat <WORKDIR>/base.txt)" \
     --title "$(cat <WORKDIR>/title.txt)" \
     --body-file <WORKDIR>/body-stamped.md
   ```
   `--draft` は付けない。
2. **返った URL から PR 番号を抽出し、`<WORKDIR>/pr-state.json` に足す**
   URL の末尾セグメントが番号。既存の `pr-state.json` に `pr_number` フィールドを追記する。`has_review` は `false` のまま
3. **投稿した本文を読み直して、マーカーが乗ったことを確かめる。** 手順は下記のとおり
4. **レビューを投稿する。** 新規 PR なので `has_review=false` 相当で常に番号コメントを付ける。`--force-comments` の有無に依らず投稿される
5. レビュー本体には「1 から N の番号順に読んでください」を書く

## 投稿後に印を確認する

**`state` が `mismatch` / `unknown` で承諾が得られず本文を更新しなかったときは、この節をまるごと行わない。** 触っていない本文を取り直せば当然 `sha_matches: false` になり、正しく見送った実行が「投稿失敗」と報告されてしまう。更新を見送った旨は報告に書く。

本文を投稿した場合だけ、投稿した PR 本文を取得し直して確かめる。**目視で確認しない。取得もスクリプトに任せる。**

```bash
node <SKILL_DIR>/lib/fetch-body.mjs --pr <PR_NUMBER> --out <WORKDIR>/posted-body.md
node <SKILL_DIR>/lib/body-marker.mjs check --body-file <WORKDIR>/posted-body.md
```

`route.json` の `route` が `gh-unsandboxed` のときは、この 2 つもサンドボックスを超えて実行する。

照合するのは囲みの中だけなので、投稿先が本文の末尾に署名を自動で足しても不一致にならない。

`sha_matches: true` が返れば、次回の実行が「AI が書いたまま」と判定できる。`false` や `has_marker: false` なら**投稿は失敗しているとみなして報告する。** マーカー無しの本文が乗ったか、別の内容が乗っている。黙って成功と言わない。

自分の PR に APPROVE や REQUEST_CHANGES は付けられない。COMMENT だけを使う。

## 部分成功を隠さない

本文の更新とレビューの投稿は別の API 呼び出しなので、片方だけ成功することがある。

片方が落ちたら、**何が成功して何が失敗したかを明示して終わる。「投稿しました」と言わない。** 失敗した側の生成物は `WORKDIR` に残す。

## 投稿できなかった場合

- 経路が `none`。MCP も `gh` も使えない
- サンドボックスを超える権限が下りなかった
- Phase 6 で `publish: false` になった

いずれの場合も**生成物を捨てない。** `WORKDIR` のパスを伝えて、手で貼れる形で渡す。

## 最後に報告する

- 主眼の数と、`概要` に畳んだかどうか
- 表層検出で出た違反の件数と、セルフレビューの指摘の直した件数・理由付きで残した件数。**骨格の違反とセルフレビューの未決着は投稿する時点で残っていないはずだが、言い換えの違反は上限到達時、つまり `max_iter_reached_publishable` のときに残ったまま投稿されることがある。** 残っていればその件数と内容を書く
- 装飾を除去した個数。装飾とは絵文字と太字である。`decoration` の合計を書く
- 語り口の判定の結果。実行するのは本気モードでは 1〜2 周目、軽量モードでは 1 周目である。足切りを通った件数・書き直した件数・書き直さず残した件数を書く。書き直さず残した件数は `unresolved` で、0 のはずである。**語り口の判定をスキップした場合は、スキップした旨とその理由を書く。** これは Phase 5 のスキップ規律による
- 圧縮の結果。実行するのは本気モードでは 1〜2 周目、軽量モードでは 1 周目である。門を通った件数・縮めた件数・理由を書いて残した件数・未決着の件数・門ごとに捨てた件数を書く。**圧縮担当の起動をスキップした場合は、スキップした旨とその理由を書く。** これは Phase 5 のスキップ規律による
- 何周回したか
- 既存本文をどう扱ったか。`body-state.json` の `state` と、囲みの差し替え・区切り線の下への追記・強制上書き・更新の見送りのどれをしたかを書く
- 人に聞いたかどうかと、その返事。承諾が得られず更新を見送った場合はその旨
- `create` モードで `--overwrite` が指定されていた場合は、**無視した旨**
- タイトルを書き換えたかどうか
- 投稿した先。本文とレビューのどちらを投稿したかを書く。投稿しなかったものがあればその理由も書く
- 新規作成した PR の番号と URL。`create` モードのときだけ
- 実際に push したかどうか。未 push だった場合は、Phase 0 で push した旨を書く
