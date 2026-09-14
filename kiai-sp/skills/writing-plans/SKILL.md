---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

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

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

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
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
