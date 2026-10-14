---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `kiai-sp:using-git-worktrees` skill at execution time.

**計画書を書き始める前に、作業するブランチを決める。** 計画書は git にコミットするので、どのブランチに載るかを先に決めておく必要がある。

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

末尾の Execution Handoff にある同じ趣旨の記述は、実装を始めるときの話である。こちらは計画書を書き始めるときの話で、別の場面である。どちらも残す。ただし Execution Handoff が `main` とだけ書いている箇所は、上の trunk 系の定義に読み替える。`develop` などにいるときに、計画づくりの側と実装の側で判定が食い違わないようにするためである。

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<Japanese topic>.md`
- (User preferences for plan location override this default)

## Path and Naming Conventions

- Name the file in Japanese, following
  `docs/superpowers/plans/YYYY-MM-DD-<Japanese topic>.md`.
- Inside the document, never write user-specific absolute paths. Use two
  placeholders:
  - `<work-root>` — the result of `git rev-parse --show-toplevel` at execution
    time. Use it for every edit target, command, and test path.
  - `<repo-root>` — the repo's main tree, the first `worktree` line of
    `git worktree list --porcelain`. Use it only when you must point at a
    different worktree or the main tree explicitly. Rare.
- When you tell the user where the plan lives, give the absolute path starting
  from `/`, not a relative path and not a `<work-root>/…` placeholder, so they
  can open it straight from an editor or terminal. This is deliberately the
  opposite of the in-document rule above.

## 既存の spec を読む

計画書を書き始める前に、元になる spec に加えて、関連する既存の spec を `docs/superpowers/specs/` から探して読む。

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## 完了条件

- 各タスクの完了は「そのタスクに紐づくテストが通ること」でよいが、**plan 全体の完了条件は必ずプロジェクト全体の単体テストとビルドがすべて通ることを含めること**。
- plan の最終タスクに「プロジェクト全体の単体テスト実行」と「プロジェクト全体のビルド実行」を独立したステップとして必ず入れること。「変更箇所のテストだけ」「変更箇所の型チェックだけ」で完了としてはならない。
- 該当プロジェクトに全体テスト・全体ビルドのコマンドが存在しない場合は、その事実を plan の最終タスクに明記し、代替となる横断検証手段（例：関連モジュール一括のテスト）を書くこと。
- **環境要因の例外:** プロジェクト側の事情（環境依存で一部のテストがそもそも動かない、既存の main で既に落ちているテストがある、外部リソースに依存するテストが該当環境で実行できないなど）で全体テスト・全体ビルドがすべては通らないことが plan 実行前から判明している場合は、通らない箇所とその理由を plan の最終タスクに明記したうえで、**その箇所を除いて残りがすべて通ること**を完了条件としてよい。plan の変更が原因で新たに落ちるようになったテストやビルドは、この例外に含めてはならない。
- **plan 本体に「人間への報告」ステップを必ず埋め込むこと:** plan を書き終えるとき、plan 実行セッションと plan 執筆セッションが同一とは限らないため、実行 AI 向けの指示は plan ドキュメント自体に書かなければ届かない。plan の最終タスクに、次の内容のステップを必ず含めること:
  - 「プロジェクト全体の単体テスト・全体ビルドを実行し、結果を人間に報告する」ステップ
  - 「環境要因で通らなかった箇所があった場合、通らなかった箇所と『plan の変更が原因ではなく環境要因である』旨を人間に必ず伝える」ステップ
  - これらを黙って省略せず、報告文の雛形として plan に具体的に書き起こしておくこと

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

**Implementation tasks follow TDD.** The first step writes a failing test; the
implementation step comes only after that test has been run and seen to fail.
Tasks whose deliverable is not code — documentation, configuration, prompt text
— are not implementation tasks.

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use kiai-sp:subagent-driven-development (recommended) or kiai-sp:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**パスの読み方:** この計画書の `<work-root>` は、実行時に `git rev-parse --show-toplevel` が返す値に置き換えて読む。`<repo-root>` は `git worktree list --porcelain` の先頭の `worktree` 行が示す値に置き換えて読む。

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

## Decisions

[The decisions settled with the user during brainstorming and planning — one
line each, in the order they were settled. Copy the spec's decision list
verbatim and append anything settled while writing this plan. An implementer
who wonders why an approach was chosen reads this section instead of guessing.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## ハーネス制約の考慮

plan を書くときは、実行するエージェントが動くハーネスの制約を先に把握し、実行中に人間承認を求めて止まる箇所が発生しない手順にすること。

**確認すべき制約の例:**

- コーディングエージェントの permission 設定で、ある種のツール呼び出しやコマンドが承認必須（`ask`）または拒否（`deny`）に指定されていないか
- コーディングエージェントに設定された hook（ツール実行前後に走るチェック機構）で、特定のツール呼び出しやコマンドパターンがブロックされる仕組みになっていないか
- サンドボックス制約で、ネットワーク越しのアクセス（外部パッケージ取得、外部 API 呼び出しなど）が実行できない場合の代替経路が必要かどうか

**plan 執筆時の判断:**

- ハーネス上そのままでは実行できない手順（拒否されるコマンド、フックで止まる操作、サンドボックス外での実行が必要な操作）は、可能な限り**別の実行手段**に置き換える（例: 拒否されるコマンドを許可済みコマンドで代替する、サンドボックス外での操作を事前に人間へ依頼するタスクとして分離する）。
- 置き換えられない場合は、**plan の冒頭に「実行前に人間の承認が必要な手順」を独立セクションとして明示**し、対応するタスクにその旨を書くこと。実行中のエージェントが不意に人間承認待ちで止まる状態にしないこと。
- 判断の根拠になった設定・フックの実在確認は、plan の Decisions セクションに残すこと。

**人間が実施する作業:**

- 人間が実施する作業を plan に書く場合は、書く前に人間と合意を取ること。
- 人間の作業は最小限にすること。plan の実行中（subagent-driven-development などで実装している間）は、人間が作業を手伝いにくいためである。
- どうしても必要な場合は、なるべく 1 つの作業ステップの中にまとめること。

## 複数の PR に分ける場合

設計書に「この作業自体の進め方」という節があり、複数の計画書に分けると書かれていれば、この作業は複数の PR に分けて積み上げる。無ければこの節は関係ない。この節を読み飛ばし、次の見出し（「積み上げたときのブランチ名」）から読む。

### 計画書を全部出す

**1 回の起動で、設計書に書かれた本数の計画書を全部出す。** 1 本ずつ起動し直す形にしない。

ファイル名は `docs/superpowers/plans/YYYY-MM-DD-<話題>-<番号>-<その計画書が何をするか>.md` とする。番号は下から順に 1、2、3 である。設計書に書かれた順番をそのまま使う。末尾はブランチ名の担当範囲と同じでなくてよい。ファイル名は人が一覧で見て中身が分かればよい。

各計画書には、対応するブランチ名を書く。ブランチ名の形は下の「積み上げたときのブランチ名」に従う。実装のスキルはここに書かれた名前を使うため、書き漏らすと実装が止まる。

各計画書の Global Constraints には、設計書の「必ず守ること」の中身をそのまま写す。要約しない。

### レビュー役の立て方

- **初回は 1 体にまとめて出す。** 5 本なら 5 本ぶんを 1 体のサブエージェントに見せる。1 本に 1 体を立てない
- **再レビューは、直した計画書だけを対象にする。** 5 本のうち 2 本を直したなら、その 2 本だけを出す。直していない 3 本は見直さない
- **再レビューも 1 体にまとめる。** 2 本を直したなら、その 2 本を 1 体のサブエージェントに見せる。1 本に 1 体を立てない

検査の記録はファイルごとに残す。直していない計画書の記録は、そのファイルの中身が変わっていない限りそのまま有効である。

### 書き終えたら聞くこと

計画書を全部書き終えた時点で、人に 1 つ聞く。「1 本目の PR だけ先に出しますか」。

ここが、1 本目の中身が出揃っていて、かつ実装がまだ始まっていない唯一の場所である。

- **はい** — `kiai-sp:finishing-a-development-branch` を 1 回走らせてから、実装に入る。この起動でも、仕上げのスキルは 3 つの選択肢をいつもどおり出す。選択肢は起動のしかたで変わらない。以下が効くのは、PR を作る選択肢が選ばれたときだけである。命名の規則・下書きにしないこと・説明文を書くスキルを走らせることは、最後のまとめて作る起動と同じである。タイトルは `<話題> (1/M) - <タイトル>` になる。`M` は計画書を全部書き終えた時点で分かっているので確定できる。「PR を作る前に止まる場面」はこの起動では通らない
- **いいえ** — そのまま実装に入る。PR は全部の実装が終わってからまとめて作る

### 実装に渡すとき

計画書が複数ある場合、実装のスキルには 1 本ずつ順に渡す。下から順である。計画書と計画書の境目では止まらない。全部終わってから報告する。

## 積み上げたときのブランチ名

複数の PR に分けて積み上げる場合に限り、各計画書に対応するブランチの名前を計画書に書く。分けない場合はこの節は関係ない。

ブランチ名は次の 4 つを並べる。

```
<話題>  <番号>  <具体名>  <担当範囲>
```

- **話題** — その作業が属する範囲。意図的に粗くしてよい。粗くすると関連する作業が一覧で固まって見える
- **番号** — 下から順に 1、2、3。PR のタイトルに入れる番号と揃える
- **具体名** — この作業を指す名前。話題を粗く取ったとき、担当範囲だけでは何の開発か分からなくなるので、ここで補う
- **担当範囲** — そのブランチが受け持つもの。1 本目は `specs` とする

区切り方は実施先リポジトリに合わせる。次の順で決める。

1. 実施先リポジトリの CLAUDE.md にブランチ名の指示があれば、それが最優先
2. 無ければ、マージコミットのメッセージとリモートのブランチ一覧から過去のブランチ名を拾い、そこで使われている形に合わせる
3. `claude/` で始まるブランチ名は道具が自動で付けたものなので、参考から外す
4. 1 も 2 も手掛かりを与えない場合は、スラッシュ区切りを既定とする

```bash
git log --merges --format='%s' -n 60
git branch -r
```

話題と残りの間の区切りだけが、上の 1〜4 で決まる。番号・具体名・担当範囲の間は常にハイフンで繋ぐ。

```
スラッシュ区切りの流儀   billing/1-invoice-pdf-specs
                        billing/2-invoice-pdf-api
                        billing/3-invoice-pdf-ui

ハイフンだけの流儀       billing-1-invoice-pdf-specs
                        billing-2-invoice-pdf-api
                        billing-3-invoice-pdf-ui
```

**この節の規則が、`kiai-sp:gh-stack` スキルに書かれているブランチ名の記述より優先する。** あちらは取り込んだままで改変しないため記述が残るが、食い違った場合はこちらに従う。あちらはスタックを作るコマンドのために読む。

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Traceability check:** Does every task trace back to a requirement in the spec? A task with no basis in the spec is scope creep — remove it. If the spec itself carries a requirement you cannot trace to the conversation, stop and ask the user rather than planning around it.

If you find issues, fix them inline. If you find a spec requirement with no task, add the task.

Then dispatch one plan document reviewer using
[plan-document-reviewer-prompt.md](plan-document-reviewer-prompt.md) and record
the result. The session gate reads this record; without it you cannot end your
turn or start implementation.

**Do not babysit the reviewer.** Once dispatched, end your turn instead of
emitting filler text while you wait — the Stop gate defers its check while
background work is in flight, and you are re-invoked automatically when the
reviewer returns. Reflect the review result and write the record then.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/review-record.mjs" write <plan-path> \
  --skill writing-plans \
  --check "Spec coverage=<what you found>" \
  --check "Placeholder scan=<what you found>" \
  --check "Type consistency=<what you found>" \
  --check "Traceability check=<what you found>" \
  --reviewer-status approved
```

Write one `--check` per item above — all four are required. Pass
`--reviewer-status approved` when the reviewer approves; anything else leaves
the gate shut. If the reviewer found issues, fix them, dispatch a fresh review, and
record the new result. If you edit the plan after recording, run the command
again: the record is bound to the file's contents and goes stale on any edit.

`<plan-path>` MUST be the absolute path you passed to Write, verbatim. The
record is stored beside its target and the gate verifies exactly the paths this
session wrote. In a worktree that is the worktree's path — re-deriving the path
from the main tree records against a file the gate never checks, and the gate
stays shut while the record looks written.

## Execution Handoff

After saving the plan, offer execution choice. Report the plan's absolute path,
not a relative one — see Path and Naming Conventions above.

**"Plan complete and saved to `<absolute path to the plan>`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

Option 1 is the default recommendation. Option 2 fits only when the plan has
few tasks and the whole of it fits comfortably in this session's context.

State the working branch in the same message:

- Currently on `main` — create an isolated worktree via
  `kiai-sp:using-git-worktrees`.
- Currently on any other branch — stay on it. This statement is the
  declared worktree preference `using-git-worktrees` Step 0 checks for; it
  should not ask again.

The choice of execution mode remains the user's. Present both options and wait.

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use kiai-sp:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use kiai-sp:executing-plans
- Batch execution with checkpoints for review
