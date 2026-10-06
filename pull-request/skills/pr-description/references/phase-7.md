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

## 前回の行コメントを消し、レビュー本体を隠す

**`edit` モードでは、レビューを投稿する前に、前回までにこのスキルが投稿した行コメントを全部消し、レビュー本体を非表示にする。** 消さずに投稿すると新旧の番号と意図コメントが二重に並び、「番号順に読んでください」がどの組を指すか分からなくなる。PR にレビューが付いているかどうかで分けない。`create` モードは新しい PR なので行わない。

**手で消さない。スクリプトに任せる。** 投稿する前に `<WORKDIR>/purge-comments.json` を削除してから走らせる。前回の実行の残りを今回のものと取り違えないためである。

```bash
node <SKILL_DIR>/lib/purge-comments.mjs --pr <PR_NUMBER> --out <WORKDIR>/purge-comments.json
```

スクリプトが消すのは、実行者自身が投稿した行コメントのうち、印 `<!-- pr-desc:comment -->` を含むものと、本文の先頭が `<数字>:` のものである。非表示にするのは、実行者自身が投稿したレビューのうち、本文に印を含むものと、「番号順に読んでください」を含むものである。人間や他のレビュワーのコメントは消さない。消した行コメントに付いていた返信は GitHub の仕組みで残る。

**`route.json` の `route` が `mcp` でもこのスクリプトは gh を使う。** GitHub MCP にはレビューを非表示にする手段が無いためである。`route` が `gh-unsandboxed` のときはサンドボックスを超えて実行する。

**失敗しても投稿を止めない。** スクリプトは常に終了コード 0 で終わり、結果を `purge-comments.json` に書く。`ok` が `false` なら一覧を取れず何も消していないとして報告する。`failed` が 1 以上なら、その件数と `failures` の理由を報告する。

## 投稿する順序

`WORKDIR/route.json` の経路を使い、`WORKDIR/mode.txt` で分岐する。

### edit モード

1. **本文を先に更新する。** 投稿する中身は `WORKDIR/body-stamped.md`。`state` が `overwrite` のときは `WORKDIR/title.txt` でタイトルも更新する。それ以外ではタイトルを触らない
   - **`state` が `mismatch` / `unknown` で承諾が得られなかったときは、本文もタイトルも更新しない。** `body-stamped.md` が無いのが正常な状態であり、投稿の失敗ではない。手順 2 の印の確認も行わず、手順 3 へ進む
2. **投稿した本文を読み直して、マーカーが乗ったことを確かめる。** 手順は下記のとおり。本文を更新しなかったときは行わない
3. **前回の行コメントを消し、レビュー本体を隠す。** 上記「前回の行コメントを消し、レビュー本体を隠す」のとおり
4. **投稿用の行コメントとレビュー本体に印を付ける。** 手で印を書かない。

   ```bash
   node <SKILL_DIR>/lib/comment-marker.mjs --in <WORKDIR>/line-comments.json --out <WORKDIR>/line-comments-post.json
   ```

   終了コードが 0 でなければ、レビューを投稿しない。標準エラーの理由を報告し、生成物を `WORKDIR` に残す
5. **レビューを後で投稿する。** 投稿する前に `<WORKDIR>/review-id.txt` と `<WORKDIR>/nav-links.json` を削除する。前回の実行の残りを今回のものと取り違えないためである。pending review を作り、`line-comments-post.json` の `comments` の各 `body` を行コメントとして全部足してから、`review_body` をレビュー本体にして COMMENT として 1 回 submit する。**`line-comments.json` の `text` をそのまま投稿しない。** 印が付かず、次の実行で消せなくなる
6. **番号コメントに移動リンクを付ける。** 番号コメントを投稿したときだけ行う。下記「番号コメントに移動リンクを付ける」のとおり

### create モード

1. **PR を作成する。**
   ```bash
   gh pr create \
     --base "$(cat <WORKDIR>/base.txt)" \
     --title "$(cat <WORKDIR>/title.txt)" \
     --body-file <WORKDIR>/body-stamped.md
   ```
   `--draft` は付けない。
2. **返った URL から PR 番号を抽出し、`<WORKDIR>/pr-state.json` に書く**
   URL の末尾セグメントが番号。中身は `{"pr_number": <番号>}` である
3. **投稿した本文を読み直して、マーカーが乗ったことを確かめる。** 手順は下記のとおり
4. **投稿用の行コメントとレビュー本体に印を付ける。** edit モードの手順 4 と同じコマンドを走らせる。終了コードが 0 でなければ、レビューを投稿しない
5. **レビューを投稿する。** 投稿する前に `<WORKDIR>/review-id.txt` と `<WORKDIR>/nav-links.json` を削除する。前回の実行の残りを今回のものと取り違えないためである。`line-comments-post.json` の `comments` の各 `body` を行コメントとして全部足し、`review_body` をレビュー本体にして COMMENT として 1 回 submit する
6. **番号コメントに移動リンクを付ける。** 下記「番号コメントに移動リンクを付ける」のとおり

## 番号コメントに移動リンクを付ける

番号コメントの末尾に、移動用のリンク行を足す。形は `[◀](…) [1](…) 2 [3](…) [▶](…)` である。`◀` は一つ前、`▶` は一つ後、数字はその番号のコメントへのリンクで、自分の番号だけはリンクにしない。1 番には `◀` を、最後の番号には `▶` を付けない。コメント ID は投稿して初めて決まるので、投稿した後に書き換える。**手で編集しない。スクリプトに任せる。**

1. レビューを投稿した応答に review の ID が含まれていれば、`WORKDIR/review-id.txt` に保存する。含まれていなければ保存しない。古いファイルは投稿前に消してあるので、ここで無いなら今回の応答に ID が無かったということである
2. 次を実行する。`review-id.txt` が無いときは `--review` を付けない。スクリプトが実行者自身の最も新しい review を選ぶ

   ```bash
   node <SKILL_DIR>/lib/nav-links.mjs --pr <PR_NUMBER> --review "$(cat <WORKDIR>/review-id.txt)" --out <WORKDIR>/nav-links.json
   ```

   `review-id.txt` が無いときは次の形で実行する。

   ```bash
   node <SKILL_DIR>/lib/nav-links.mjs --pr <PR_NUMBER> --out <WORKDIR>/nav-links.json
   ```

**`route.json` の `route` が `mcp` でもこのスクリプトは gh を使う。** GitHub MCP には行コメントを編集する手段が無いためである。`route` が `gh-unsandboxed` のときはサンドボックスを超えて実行する。

**失敗しても投稿を止めない。** スクリプトは常に終了コード 0 で終わり、結果を `nav-links.json` に書く。`ok` が `false` なら、番号コメント全件にリンクを付けられなかったとして報告する。gh が使えない環境もここに入る。`failed` が 1 以上なら、その件数を報告する。

`line-comments.json` にはリンク行を入れない。表層検査と各エージェントが見るのはリンク行の無い本文である。番号コメントが 1 件以下のときは、スクリプトは何も編集しない。

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
- 前回の行コメントを消した件数と、レビュー本体を非表示にした件数。`purge-comments.json` の `deleted` と `hidden` を書く。`failed` が 1 以上ならその件数と理由、`ok` が `false` なら理由 `reason` と、何も消していないことを書く。`create` モードでは書かない。消した後にレビューの投稿が失敗した場合は、前回の行コメントが消えたまま新しいものが無い状態であることを明示する
- 番号コメントに移動リンクを付けた件数と、付けられなかった件数。`nav-links.json` の `linked` と `failed` を書く。`ok` が `false` なら理由 `reason` と、番号コメント全件にリンクが無いことを書く。番号コメントを投稿しなかった実行では書かない
- 新規作成した PR の番号と URL。`create` モードのときだけ
- 実際に push したかどうか。未 push だった場合は、Phase 0 で push した旨を書く
