---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use kiai-sp:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. 作業するブランチを決める（下の「作業するブランチの決め方」を見る）
2. Read plan file
3. Review critically - identify any questions or concerns about the plan
4. If concerns: Raise them with your human partner before starting
5. If no concerns: Create todos for the plan items and proceed

### 作業するブランチの決め方

始める前に、いまいるブランチを見る。

| いまいるブランチ | すること |
|---|---|
| trunk 系のブランチ | `kiai-sp:using-git-worktrees` を呼び、ワークツリーを切って、そこで作業する |
| trunk 系以外のブランチ | そのブランチで作業する。ワークツリーは切らない |

trunk 系と見なすのは `main` `master` `develop` `trunk`、およびそのリポジトリの既定ブランチである。いまいるブランチの名前が取れない場合（リベースの途中など）は trunk 系として扱う。

```bash
git branch --show-current
```

既定ブランチは次のとおりに調べる。クローンの仕方によっては 1 つ目が空を返すので、そのときは 2 つ目に落とす。2 つ目はリモートに問い合わせるため、ネットワークが要る。

```bash
default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
[ -n "$default_branch" ] || default_branch=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
echo "$default_branch"
```

2 つとも空を返した場合は、既定ブランチが分からないということなので、上の 4 つの名前だけで判定する。

### 積み上げである場合のブランチの積み方

この計画書が、1 つの設計書を複数の計画書に分けたもののうちの 1 本であるかを見る。設計書に「この作業自体の進め方」という節があり、複数の計画書に分けると書かれていれば、積み上げである。無ければ積み上げではなく、この節は関係ない。この節と、次の「積み上げである場合の、下のブランチのコードの直し」の節を読み飛ばし、その次の見出しから読む。

**積み上げである場合、各計画書の実装を始めるときに、いまいるブランチの上に新しいブランチを 1 本積む。** いまいるブランチで作業するのではない。

ブランチ名は計画書に書かれている。自分で考えない。書かれていなければ人間に聞く。

**ここでは `gh stack` を使わない。** 普通の git でブランチを作る。スタックを組むのは PR を作るときで、そのときに既にあるブランチがまとめて取り込まれる。

積む前に、いまいるブランチが積み上げのいちばん上であることを確かめる。

```bash
git branch --show-current
git switch -c <計画書に書かれたブランチ名>
```

**実装の入口で trunk 系のブランチにいた場合の扱い。** 別の日に再開した場合などに起きる。このときはワークツリーを新しく切らず、**積み上げのいちばん上のブランチに移ってから積む**。1 本目ではない。

いちばん上のブランチは、計画書に書かれたブランチ名のうち、既に存在していて番号がいちばん大きいものである。

```bash
git branch --list
git switch <いちばん上のブランチ名>
```

1 本目に移って積むと、その手前までに実装した分が、新しく作るブランチに入らなくなる。計画書①の実装を始める時点ではいちばん上が 1 本目なので両者は一致するが、計画書②以降では違うブランチになる。

**計画書と計画書の境目では止まらない。** 1 本終わったら次の計画書の実装に進む。全部終わってから人間に報告する。途中で承認を求めない。

**PR はここでは作らない。** すべての計画書の実装が終わったあと、`kiai-sp:finishing-a-development-branch` が作る。このスキルの中で PR を作る操作を呼ばない。

### 積み上げである場合の、下のブランチのコードの直し

積み上げでなければ、この節も関係ない。読み飛ばして次の見出しから読む。

実装中に、下のブランチで作ったコードが間違っていると気づくことがある。下のブランチの中身はいまいるブランチからも見えるためである。

**そのコードを持っているブランチに移って直す。** いまいるブランチに直しを書かない。ここでも `gh stack` は使わない。

どのブランチのものか分からないときは、そのファイルがどこで作られたかを見る。

```bash
git log --all -- <ファイルパス>
```

**直す前に、直す対象のブランチのいまのコミットを控える。** 上のブランチを載せ替えるときに、どこからが上のブランチの分なのかを示すために要る。控え忘れると載せ替えの起点が分からなくなる。

```bash
git rev-parse <直す対象のブランチ名>
```

控えたら、そのブランチに移って直す。

```bash
git switch <直す対象のブランチ名>
# ここで直してコミットする
```

直したら、その上のブランチを下から順に 1 本ずつ載せ替える。

```bash
git rebase --onto <直す対象のブランチ名> <控えたコミット> <すぐ上のブランチ名>
```

上のブランチが 2 本以上あるときは、同じことを下から順に繰り返す。2 本目を載せ替えるときに使う控えは、1 本目を載せ替える前のそのブランチのコミットである。**載せ替えを始める前に、上のブランチ全部のコミットを控えておく。** 1 本載せ替えるたびにコミットが変わるため、あとから取り直せない。

全部終わったら元の位置に戻る。

```bash
git switch <元いたブランチ名>
```

この時点では実装のブランチの PR が 1 本も出ていないため、下のブランチを直しても誰にも影響しない。載せ替える相手も、いま作っているブランチだけである。

1 本目の PR を先に出してある場合、1 本目のブランチだけは PR が出ている。そこへの直しは、コミットを足してそのまま押す。

```bash
git switch <1 本目のブランチ名>
# ここで直してコミットする
git push
```

押したあと、上のブランチを同じやり方で載せ替える。コミットを足すだけなので 1 本目の履歴の書き換えは起きず、既に付いている承認は取り消されない。行コメントも畳まれない。上のブランチはまだ押していないので、押す操作はここだけである。

載せ替えで衝突した場合は、自力で解決せず中断して人間に報告する。衝突するということは、下のブランチと上のブランチが同じ行を触っているということで、それは「上は下に依存するが、下は上を知らない」という分け方の前提が崩れている合図である。

```bash
git rebase --abort
```

#### 2 つのブランチを同時に直さないと意味が通らない場合

**切って分けるのを既定とする。ただし無理に切らない。**

切れたと認めるのは、次の 2 つが両方そろったときだけである。

1. 下のブランチに入れるほうが、下のブランチに既にあるファイルとコードだけで完結している
2. その状態で下のブランチのテストが通る。テストの修正は、直しが振る舞いを変えたぶんだけ

**試すのは 1 回だけである。** 切り方を作り直して 2 回目を試さない。1 回で上の 2 つがそろわなければ切れないものと見なし、直しをいまいるブランチに置いたままにする。そして、下の PR の説明文に「ここは上の PR で直しています」と 1 行足す。説明文を書くのは仕上げのスキルなので、そのスキルを起動するときに、どの計画書のぶんをどの PR の説明文に足すのかを一緒に伝える。

**切るか切らないかに判断を入れない。** テストが通ったかどうかだけで決める。「たぶん切れそう」で 2 回目を試さない。

同じことが何度も起きる場合は、PR の分け方が依存関係と合っていない合図である。人間に報告する。勝手に分け方を変えない。

直しが大きく、それだけで読む価値がある場合は、直しだけのブランチを積み上げのいちばん上に新しく積む。この判断は人間に確認してから行う。

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use kiai-sp:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
