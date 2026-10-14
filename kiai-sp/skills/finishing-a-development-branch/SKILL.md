---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work
---

# Finishing a Development Branch

## Overview

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## Step 1: Verify Tests

Run the project's full test suite (`npm test` / `cargo test` / `pytest` / `go test ./...`).

**If tests fail**, report the failures and stop — the menu comes after a green suite:

```
Tests failing (<N> failures). Must fix before completing:

[Show failures]
```

**If tests pass:** continue to Step 2.

## Step 2: Detect Environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
# Capture now, while still inside the workspace — Step 5 changes directory
# before cleanup (Step 6) needs this value
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

This determines which menu to show and how cleanup works:

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | Standard 3 options | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 3 options | Provenance-based (see Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 2 options (no merge) | Externally managed — leave in place |

## Step 2.5: 積み上げかどうかを見分ける

このブランチが、1 つの設計書を複数の PR に分けて積み上げたものの一部かどうかを見る。積み上げでなければ、以降の積み上げ向けの記述はすべて読み飛ばす。**Step 4 で出す 3 つの選択肢は、積み上げでもそうでなくても同じものを同じ文面で出す。**

積み上げだと判定するのは、対応する設計書に「この作業自体の進め方」という節があり、複数の計画書に分けると書かれているときである。

切り離された HEAD で Step 4 の選択肢が 2 つに減る場合は、積み上げでないものとして扱う。積み上げはブランチ名を前提にするためである。

**積み上げであるとき、実装のコミットがあるかどうかで、2 つの起動を見分ける。**

```bash
git log --oneline <積み上げ全体の取り込み先ブランチ>..HEAD
```

計画書のファイルは揃っているのに実装のコミットが 1 つも無いなら、それは「1 本目の PR だけを先に出す起動」である。**人に聞かない。** 下の「1 本目の PR だけを先に出す起動」に進む。この時点でスタックがまだ無いのは想定どおりである。ここでやるのは判定だけで、Step 3 と Step 4 はいつもどおり通る。3 つの選択肢も普段どおり出す。

実装のコミットがあるなら、最後のまとめて作る起動である。人に聞かない。

判定の結果を、以降「積み上げである」「積み上げでない」と呼ぶ。

**ここから Step 2.5 の終わりまでは、積み上げであるときだけ読む。**

**積み上げのブランチとは何か。** 設計書に書かれた 1 本目のブランチ、各計画書に書かれたブランチ、実装中に足した直しだけのブランチのうち、いま実在するものである。1 本目のブランチ名は計画書には書かれないため、設計書から取る。実在するかどうかは `git branch --list` で確かめる。1 本目のブランチは、ローカルで取り込んだ場合には実在しない。そのときは候補に入らない。

**いちばん上のブランチの決め方。** 積み上げのブランチそれぞれについて、取り込み先ブランチからのコミット数を数える。いちばん多いものが、いちばん上のブランチである。積み上げは一列なので、上のブランチは下のブランチのコミットを全部含む。したがってコミット数がいちばん多いものが、いちばん上にある。

```bash
git log --oneline <積み上げ全体の取り込み先ブランチ>..<ブランチ名>
```

**番号では決めない。** 直しだけのブランチは割り当て済みの番号の続きを取るため、まだ作っていない計画書のブランチより大きい番号になる。そのあとその上に計画書のブランチを積むと、番号の順と積み上げの順が食い違う。

**候補が 1 本も無いときは、取り込み先ブランチがいちばん上である。** 候補が 1 本も無くなるのは、1 本目を先に出す起動でローカルで取り込む選択肢が選ばれ、1 本目のブランチが消えた場合である。

## Step 3: Determine Base Branch

The base branch is whatever this work forked from — usually named in the
plan, the conversation, or the branch's upstream. If it is not already
known, ask: "This branch split from <your best guess> - is that correct?"
Confirm before merging: merging into the wrong base is expensive to undo.

## Step 4: Present Options

**Normal repo and named-branch worktree — present exactly these 3 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**Detached HEAD — present exactly these 2 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)

Which option?
```

Present the menu exactly as written — concise, with every option coming
from the list above. Discarding the work happens only in response to your
human partner explicitly asking for it (see "If your human partner asks to
discard the work" below). Wait for their answer; the integration decision
is theirs.

## Step 5: Execute Choice

### Option 1: Merge Locally

**1 本目の PR だけを先に出す起動である場合。** そのとおり取り込む。止まらない。取り込むのは、設計書と計画書が載った 1 本目のブランチである。以下の手順をそのまま実行し、`<feature-branch>` はそのブランチを指す。

設計書と計画書は取り込み先ブランチに載り、1 本目のブランチはこのスキルがそのあと消す。1 本目の PR は作らないため、PR の本数は計画書の本数と同じになる。積み上げの土台は取り込み先ブランチのままである。変わるのは、土台と実装ブランチのあいだに設計書と計画書のブランチが挟まらなくなることだけである。以降どこで作業するかは、実装を始める入口で効くブランチの規則に従う。

**積み上げであり、すべての実装が終わっている場合。** 取り込むのは、積み上げのいちばん上のブランチである。いちばん上には下のブランチの中身が全部入っているため、それ 1 本で作業全体が入る。PR は 1 本も作らない。積み上げの各ブランチを個別に取り込むことはしない。

いちばん上のブランチは、Step 2.5 の「いちばん上のブランチの決め方」に従って決める。取り込み先ブランチからのコミット数がいちばん多いものである。番号では決めない。

```bash
git switch <いちばん上のブランチ名>
```

いちばん上に移ってから、以下の手順に入る。以下で `<feature-branch>` と書かれている箇所は、いちばん上のブランチを指す。

**積み上げでない場合。** 以下を実行する。

**元のフォルダへの移り方。** この会話が `EnterWorktree` のような道具で worktree に入っているなら、`cd` では移らない。worktree の中にいるあいだは、元のフォルダへの移動とそこでの git 操作が、ハーネスやフックに止められるためである。先に `ExitWorktree`（`action: "keep"`）で元のフォルダに戻り、下のブロックから `MAIN_ROOT=` と `cd` の 2 行を除いた残りを実行する。そうした道具が無いときだけ、ブロックをそのまま実行する。止められたときは、権限が無いと判断して人間にコマンドを渡す前に、まずこれを試す。

compact のあとは、worktree に入った記憶が抜けていることがある。覚えが無くても、Step 2 の判定で `GIT_DIR != GIT_COMMON` なら worktree の中にいるので、作業を終える前に `ExitWorktree` を検討する。

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.

Once the merged result is green: clean up the worktree (Step 6), then
delete the branch:

```bash
git branch -d <feature-branch>
```

### Option 2: Push and Create PR

**分岐は 3 つある。**

- **積み上げでない場合** — この節の残りをそのまま実行する
- **1 本目の PR だけを先に出す起動である場合** — 下の「1 本目の PR だけを先に出す起動」に従う
- **積み上げであり、すべての実装が終わっている場合** — 下の「積み上げのときの手順」を実行し、この節の残りは読み飛ばして「Both paths continue here」へ進む

積み上げでない場合は、下の `####` で始まる 2 つの小節を飛ばし、その次の段落（`pr-description` スキルの話）から読む。

#### 1 本目の PR だけを先に出す起動

計画書を書き終えた直後に、1 本目の PR だけを先に出すためにこのスキルが起動されることがある。1 本目の PR に載るのは設計書と計画書だけで、コード変更は入らない。**この起動は下の「積み上げのときの手順」ではなく、この節に従う。**

この起動かどうかは Step 2.5 で判定済みである。Step 2.5 の判定は「積み上げである」になり、そのうえで実装のコミットが 1 つも無いことでこの起動だと見分けられている。ここで判定をやり直さない。

**積み上げ専用の手順は走らせない。** PR は 1 本だけ、積み上げでない場合と同じ手順で作る。積み上げ専用の手順は「PR を作る前の確認」で人が承認した一覧を使うが、この起動はその場面を通らないため一覧が無い。実装のブランチもまだ 1 本も無く、並べる相手が 1 本目しかない。

**ここでいう「同じ手順」が除くのは 2 つだけである。** スタックを組むことと、PR を作る前に止まって人の承認をもらうことである。この 2 つ以外は、積み上げでない場合とまったく同じである。止まる場面を通らないのは、あの場面が実装の全部終わったあとに置かれているからである。

この起動では次のとおりにする。

- PR は 1 本だけ作る。この節の残り、つまり積み上げでない場合の手順をそのまま使う
- **PR を作ったあと、タイトルを `<話題> (1/M) - <タイトル>` に付け直す。** 説明文を書くスキルはタイトルを外から受け取らないため、作った時点のタイトルは命名の規則に沿っていない。作ったあとに `gh pr edit` で直す。`M` は計画書の本数に 1 を足した数であり、計画書を全部書き終えた時点で確定している
- **下書きにしない**
- `pr-description` スキルがスキル一覧にあれば、そのスキルで説明文を書く

```bash
gh pr edit <PR番号> --title "<話題> (1/M) - <その PR のタイトル>"
```

命名の規則と、下書きにしないことと、`pr-description` スキルで説明文を書くことは、最後のまとめて作る起動と同じである。

手順の並びは、この節の残りにある積み上げでない場合の手順で PR を 1 本作り、そのうえでタイトルを付け直し、それから「Both paths continue here」へ進む形になる。

このあと実装に入り、すべての実装が終わってからこのスキルがもう一度起動される。そのときは下の「積み上げのときの手順」に従う。既に PR がある 1 本目を対象から外す必要は無い。

#### 積み上げのときの手順

起動は 1 回だけである。ブランチの本数分だけこのスキルを起動し直すことはしない。

**スタック PR の要件として、禁止することが 2 つある。** 次の 2 つは、GitHub がスタックとして扱える形を壊す。下の 2 つの道のどちらでも効く。

- **途中のブランチにだけ、最新の取り込み先ブランチをマージしない。** 一列のどこか 1 本にだけ新しい親が入ると、その 1 本から上が一列でなくなり、スタックの要件から外れる。取り込み先ブランチが進んでも、積み上げの途中のブランチにそれを取り込まない
- **1 本のブランチから 2 本以上のブランチを生やさない。** 積み上げは一列である。枝分かれさせない。新しいブランチを積む先は、常に積み上げのいちばん上のブランチである

**先に、`gh stack` が使えるかを確かめる。** `gh stack` を使うのはこの手順だけなので、ここで確かめれば足りる。実装中は素の git しか使わない。**確かめるのは、下にある「まず、人に承認をもらう」より前である。** どちらの道を通るかが決まってから承認をもらうためである。

**確かめるのは 2 段である。まずこの環境で動くか、次に拡張が入っているかである。**

**1 段目。この環境で `gh stack` が動くかを確かめる。** 拡張を入れても動かない環境があるためである。`gh stack` は GitHub の GraphQL を使うので、そこが塞がれていると拡張を入れても直らない。

```bash
gh api graphql -f query='{viewer{login}}'
```

これが 403 を返す環境では `gh stack` は使えない。この場合は拡張を入れるかを人に聞かず、そのまま下の「画面でスタック化してもらう道」に進む。

**2 段目。拡張が入っているかを確かめる。**

```bash
gh extension list | awk '$2 == "stack"'
```

`gh extension list` は拡張を `gh stack` のように `gh` と名前を並べて出す。2 つ目の語を見て、名前が `stack` と完全に一致する行だけを拾う。名前に `stack` を含む別の拡張を拾わないためである。

行が出れば使える。出力が空なら使えない。ただし `gh` 自体が入っていない場合や認証が済んでいない場合も出力は空になり、拡張を入れても直らない。入れる前に `gh` が使える状態かを見ておく。

**ここまでの結果で道が 3 つに分かれる。**

| 状態 | すること |
|---|---|
| `gh stack` が動く。拡張も入っている | 下の「`gh stack` でスタックを組む道」をそのまま走らせる |
| `gh stack` が動く。拡張が入っていない | 入れるかを人に聞く。入れてよいと言われたら入れて、「`gh stack` でスタックを組む道」を走らせる。入れないと言われたら「画面でスタック化してもらう道」に進む。入れるのに失敗した場合も「画面でスタック化してもらう道」に進む |
| `gh stack` が動かない | 聞かずに「画面でスタック化してもらう道」に進む |

拡張が入っていない場合、**人に「`gh stack` を入れますか」と聞く。** 勝手に入れない。ここで聞くのは 1 段目を通っている場合だけである。1 段目で使えないと分かった場合は聞かない。

**入れてよいと言われた場合は、次で入れてから「`gh stack` でスタックを組む道」に進む。**

```bash
gh extension install github/gh-stack
```

**入れないと言われた場合は、「画面でスタック化してもらう道」に進む。** 積み上げをやめて普通の PR を 1 本作る形に勝手に切り替えないことは変わらない。PR は積み上げの本数ぶん作り、スタックとして繋ぐところだけを人に画面でやってもらう。

**入れるコマンドが失敗した場合も、「画面でスタック化してもらう道」に進む。** 入れるのに失敗したということは、その環境では `gh stack` が使えないということである。積み上げをやめて普通の PR を 1 本作る形に勝手に切り替えないのも、入れないと言われた場合と同じである。

**まず、人に承認をもらう。** すべての実装が終わったあと、PR を作る前に 1 回止まる。次を出して、承認を待つ。この承認は、どちらの道を通る場合にも要る。

- 積み上げの各ブランチと、そこに入っているコミットの一覧
- 実装中に入れた直しのうち、本来は下のブランチに属するかもしれないものがあれば、その一覧と、どのブランチに置いてあるか

この時点ではまだスタックを組んでいないため、`gh stack view --json` では一覧が出せない。代わりに、Step 2.5 で定めた積み上げの各ブランチについて、1 つ下のブランチからの差分を `git log --oneline` で出す。

```bash
git log --oneline <1 つ下のブランチ>..<対象のブランチ>
git log --oneline <積み上げ全体の取り込み先ブランチ>..<いちばん上のブランチ>
```

承認が下りるまで PR を作らない。承認が下りなければ、置き直してからもう一度出す。この時点では PR が 1 本も出ていないため、何度でも置き直せる。1 本目を先に出してある場合、1 本目のブランチへの直しはコミットを足す形にする。履歴は書き換えない。既に付いている承認を取り消さないためである。

##### `gh stack` でスタックを組む道

**この道に入る前に、`kiai-sp:gh-stack` スキルを読む。** PR を作るコマンドの引数と落とし穴はそちらに書かれている。特に `references/commands.md` の link の項を読む。

**スタックを組み、全ブランチの PR を一度に作る。** 実装中はブランチを積んだだけで、スタックはまだ無い。組むのは 1 回で、下から順に全ブランチを並べる。1 本目のブランチが実在するなら、それも必ず入れる。push すること、足りない PR を作ること、各 PR の取り込み先を連ねることを、`gh stack link` 1 つでまとめて行う。

並べるブランチの一覧は道具からは取れない。この時点ではまだスタックが無いためである。**「まず、人に承認をもらう」で出した一覧を、そのまま使う。** 各計画書に対応するブランチ名はそこに出ており、順番は計画書の順番である。1 本目のブランチが実在するなら、その先頭に置く。

1 本目をローカルで取り込んである場合は、1 本目のブランチが実在しないため、先頭に置くものが無い。一覧は計画書のブランチだけになり、いちばん下のブランチの取り込み先が積み上げ全体の取り込み先ブランチになる。設計書と計画書は既に取り込み先ブランチに入っているため、どの PR の差分にも混ざらない。

```bash
gh stack link --base <積み上げ全体の取り込み先ブランチ> --open <1本目のブランチ> <2本目のブランチ> ... <いちばん上のブランチ>
```

- `--base` には積み上げ全体の取り込み先になるブランチを入れる
- `--open` を付けるのは、付けないと下書きで作られるためである。**PR は下書きにしない**
- 1 本目のブランチが実在するのに引数から落とすと、1 本目がスタックから外れ、その PR が作られない。2 本目の PR の取り込み先が積み上げ全体の取り込み先ブランチになり、設計書と計画書のコミットが 2 本目の差分に混ざる
- 各 PR の取り込み先が 1 つ下のブランチになるのは、この道具がそういうものだからである。自分で指定しない
- 1 本目の PR を先に出してある場合も、1 本目を対象から外す必要はない。既に PR があるブランチには新しく作らず、取り込み先が違っていれば直される
- スタック登録は足すだけで外さない。あとからブランチを足しても、既にあるものは壊れない

リモートが複数あるリポジトリでは、`remote.pushDefault` が設定されていない限り `--remote <リモート名>` も付ける。本家の SKILL.md にこう書かれている。

> **Multiple remotes:** never run `push`, `submit`, `sync`, `rebase`, or `link` without
> `--remote <name>` unless `remote.pushDefault` is configured.

本家の参照ファイル `references/commands.md` の link の項に、次のとおり書かれている。

> Branch arguments are pushed automatically (non-force, atomic). Missing PRs are created with auto-generated titles and correctly chained bases; existing PRs with a wrong base are corrected.

`link` はローカルに追跡の状態を書かないため、位置を移す `up` `down` `top` `bottom` は、できたスタックの上では使えない。本家の参照ファイル `references/troubleshooting.md` にそう書かれている。この運用では実装中に `gh stack` を使わず、PR を作ったあとも位置を移すのに使わないため、これで困らない。

スタックの PR がそのリポジトリで有効になっていない場合は、積み上げられないことを人に伝えて止まる。積み上げない普通の PR を作る案が出ても、その案には乗らない。

**次に、各 PR のタイトルを付け直す。** 作った時点のタイトルは自動生成なので、計画書に書かれた形に直す。

```bash
gh pr edit <PR番号> --title "<話題> (N/M) - <その PR のタイトル>"
```

- `N` は下から数えた番号、`M` は PR の総本数である。1 本目の PR を作らなかった場合、`M` は計画書の本数と同じになる
- 設計書と計画書の 1 本目の PR が実在するなら、それも含めて全部に付ける
- 1 本目を先に出してある場合、その PR のタイトルも同じ形に揃っているはずである。揃っていなければ直す

**最後に、PR ごとに説明文を書く。** `pr-description` という名前のスキルがこのセッションのスキル一覧にあるなら、PR 1 本につき 1 回そのスキルを走らせる。どのプラグインが提供していてもよい。

```
/<plugin>:pr-description --pr=<PR番号>
```

**このスキルは現在の作業ツリーで差分を取るため、1 本走らせるごとに、その PR のブランチへ移ってから走らせる。**

```bash
git switch <その PR のブランチ>
```

この時点で PR は既に存在するため、番号で指定する。一覧に無ければ、この節の残り（積み上げでない場合の手順）にある手書きの経路に落ちる。PR は既にあるので、その経路のうち本文の書き方だけを使う。PR は作り直さない。

説明文を書き終えたら「Both paths continue here」へ進む。そこで CI を待つときは、いちばん上の PR の番号を使う。

##### 画面でスタック化してもらう道

**この道でも PR は作る。** 作らないのはスタックを組むところだけである。スタックとして登録するのは GitHub の画面のボタンを押す操作で、人がやれば一瞬で終わる。`gh stack link` はそれをコマンドから行うための道具にすぎない。

この道では次の 4 つを行う。

1. 積み上げの各ブランチに PR を 1 本ずつ作る。取り込み先は 1 つ下のブランチにして、一列の依存関係にする。並べる順番と一覧は「まず、人に承認をもらう」で人が承認したものに従い、1 本目のブランチが実在するならその先頭に置く。いちばん下の PR の取り込み先だけが積み上げ全体の取り込み先ブランチになる。本数は上の道と同じで、計画書が 3 本なら 4 本、1 本目をローカルで取り込んである場合は 3 本である。1 本目を先に出してある場合、その PR は既にあるので作らない
2. 各 PR のタイトルを `<話題> (N/M) - <その PR のタイトル>` に付け直す。形も `gh pr edit` を使うことも、上の道と同じである
3. `pr-description` スキルで PR 1 本ごとに説明文を書く。渡す形も、そのブランチへ移ってから走らせることも、上の道と同じである。一覧に無ければ、この節の残りにある手書きの経路のうち本文の書き方だけを使う
4. 人に「GitHub の画面でスタック化してください」と伝える

**人にコマンドは渡さない。** 画面のボタンを押す操作なので、コマンドを渡すのは筋が違う。

PR を作る手立ては、この節の残りにある手書きの経路である。取り込み先を 1 つ下のブランチに指定して、1 本ずつ作る。`gh stack` は 1 回も使わない。

**PR は下書きにしない。** 上の道と同じである。

**上の禁止 2 つは、この道でも効く。** 人が画面でボタンを押すだけの状態にしておくためである。

説明文を書き終えたら「Both paths continue here」へ進む。そこで CI を待つときは、いちばん上の PR の番号を使う。

**If a `pr-description` skill is on this session's skill list — whatever
plugin provides it — you are not on a detached HEAD, and the remote is
GitHub with `gh` available, hand the whole thing to that skill.** That skill pushes only a branch that has
never been pushed; it writes the title and body, opens the PR, and posts its
own line comments on the diff. If this branch already has an upstream with
unpushed commits, push them yourself before delegating — otherwise the PR it
opens or updates will be missing those commits. Invoke it with the base
branch you confirmed in Step 3, under the name the skill list shows it as,
as a skill invocation, not a shell command:

```
/<plugin>:pr-description --base=<base-branch>
```

Report the PR URL that skill gives you, then continue at "Both paths continue
here" below. **Do not append the spec/plan block to the body it posted.** That
skill screens every line of what it publishes; text bolted on afterwards has
been through no such screening. On a branch that already has an open PR, it
refreshes that PR's body instead of opening a new one, and leaves the title
and base untouched. If it ends without opening or refreshing a PR — a
refused sandbox-crossing permission, or a publish route of `none` — fall
through to the manual path below instead of treating the run as complete.
If no PR existed yet, the manual path's creation steps below apply as
written; if one already exists but was not refreshed, update that existing
PR instead of trying to open a new one.

**Otherwise** — the skill is not on the list, you are on a detached HEAD, or
the remote is not GitHub (or `gh` is not available) — open the PR yourself,
exactly as below. A detached HEAD is excluded because
`pr-description` finds the PR from the branch you are on, pushes
with `git push -u origin HEAD`, and lets the forge CLI infer the push source
the same way. With no branch name, none of those three resolve. A non-GitHub
remote is excluded because that skill's fetch/create/comment steps call `gh`
directly, with no path for another forge's CLI.

```bash
git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# git push origin HEAD:refs/heads/<new-branch>
```

Then create the pull/merge request against <base-branch> with the forge's
tooling — its CLI if one is available, or the creation URL most forges
print when you push — following the repo's PR template and conventions if
present, and report the URL to your human partner.

If a spec and plan exist under `docs/superpowers/`, attach them — otherwise
skip this block. On GitHub, with `gh` available: at the end of the PR body,
add a `<details>` block linking to both, as blob URLs pinned to this
branch's head commit that a reviewer can open from the PR:

```markdown
<details>
<summary>Spec / Plan</summary>

- [Spec](https://github.com/<owner>/<repo>/blob/<commit-sha>/docs/superpowers/specs/<spec-file>)
- [Plan](https://github.com/<owner>/<repo>/blob/<commit-sha>/docs/superpowers/plans/<plan-file>)

</details>
```

**Both paths continue here.** Wait for CI. On GitHub, with `gh` available, run
`gh pr checks <PR#> --watch` in the background (`run_in_background: true`, a
Claude Code Bash-tool parameter) so the session is not blocked, and report the
verdict when it lands. If any check fails, start `kiai-sp:systematic-debugging`
on that failure — a red PR is not finished work.

Keep the worktree — your human partner iterates on PR feedback there.

### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**積み上げである場合。** 何もしないため、積み上げには何の影響も無い。1 本目の PR だけを先に出す起動であっても同じで、そのまま実装に入ってよい。

### If your human partner asks to discard the work

This path exists only as a response to an explicit request to throw the
work away. Confirm first:

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for that exact confirmation. When it arrives, move to the main repo root. Option 1 の「元のフォルダへの移り方」と同じく、`ExitWorktree` が使えるなら先に `ExitWorktree`（`action: "keep"`）で戻り、下のブロックは実行しない。使えないときだけ下のブロックを実行する。

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Then clean up the worktree (Step 6) and force-delete the branch:

```bash
git branch -D <feature-branch>
```

## Step 6: Cleanup Workspace

**Runs for Option 1 and confirmed discards.** Options 2 and 3 always
preserve the worktree. Both callers have already changed directory to the
main repo root — worktree removal must run from outside the worktree —
and use the `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` values captured in
Step 2, from before that directory change.

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If `WORKTREE_PATH` is under `.worktrees/` or `worktrees/`:** Superpowers
created this worktree — we own cleanup:

```bash
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment owns this workspace — leave it in
place. If your platform provides a workspace-exit tool, use it.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| Discard (explicit request only) | - | - | - | yes (force) |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. A green run only proves the tree it ran on. |
| "They obviously want it merged" | Integration is your human partner's decision. Present the menu and wait. |
| "They seem done with this feature — I'll offer to discard it" | The menu is complete as written. Discard happens only when your human partner asks for it in so many words. |
| "'Yeah, get rid of it' counts as confirmation" | Only the typed word `discard` authorizes deletion. |
| "The PR is up, so the worktree is clutter now" | PR feedback gets fixed in that worktree. It stays until the work lands. |
| "This other worktree looks stale — I'll clean it too" | Clean up only worktrees under `.worktrees/` or `worktrees/`. Everything else belongs to the host. |
| "The merged-result failure is probably flaky" | A failing merged result stops everything. Branch and worktree stay put while you investigate. |
| "The base branch is obviously main" | Confirm the fork point or ask. Merging into the wrong base is expensive to undo. |
| "The push was rejected — force-push will fix it" | A rejected push means the remote moved. Investigate; force-push only on your human partner's explicit request. |
| "I'll just write the PR body myself — it's faster" | When a `pr-description` skill is on the skill list, you're not on a detached HEAD, and the remote is GitHub with `gh` available, hand it to that skill instead. The difference is not speed; it is whether the body went through that skill's screening. |
