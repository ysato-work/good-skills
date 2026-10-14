---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by classifying how much process the request needs, then work
through your path: understand the context, refine the idea, present a
design, and get your human partner's approval.

<HARD-GATE>
Do NOT take any implementation action — write code you keep, decide the
spec, decide what gets built — until you have told your human partner what
you intend and they have approved it. This applies to EVERY task on EVERY
path below. Investigating and verifying, including throwaway code, is not
implementation: announce what you will investigate in one line, run it
without waiting for approval, and report what you found.
</HARD-GATE>

## Two Paths

Before your first question, classify the request and say the
classification out loud — "this looks like a spike, so I'll find out and
report back rather than build anything we keep" — so your human partner
can override it:

- **Spike** — a feasibility question ("can we...", "is it possible...",
  "quick and dirty is fine") whose output is an answer, not code you
  keep. Announce what you will investigate in one line, then find out as
  cheaply as correctness allows — no approval needed, throwaway code
  allowed. No design doc, no spec file. Report what you found as a
  recommendation; anything you keep is a new request.
- **Architectural** — new projects, new subsystems, changes that
  restructure how components fit together or alter interfaces others
  depend on. Follow the full process: questions, approaches, sectioned
  design, written spec, then the writing-plans skill.

When in doubt between two paths, take the heavier one. The ratchet is
one-way: hidden complexity discovered mid-task upgrades the path —
stop, say so, and step up. Nothing downgrades mid-task.

## Investigate Before You Ask

Every question you send costs the human a reply, so resolve each open
question in this order before you ask it:

1. If the code, docs, history, an experiment, or the web can answer it —
   investigate (dispatch a sub-agent when the fact lives in the environment),
   then proceed on what you found.
2. If it is an implementation detail you may decide at your own
   discretion — decide it, and state the reasoning when you report.
3. Only if neither applies, the choice materially changes what gets built,
   its priority, or the risk the human accepts, and the answer is
   unavoidable to reach the stated goal — ask the human.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the
environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for
anything you could look up yourself. Don't block on it: a running exploration is an unsettled
prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the
rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

| What you are looking up | Who looks it up |
|---|---|
| A fact that lives in the environment — files, tools, history | A sub-agent |
| A detail you may settle at your own discretion | You decide it |

Research and verification, including throwaway code, need no approval:
announce what you will investigate in one line, run it, and report what you
found. The report is mandatory. Keeping throwaway code is implementation —
reclassify it and get approval, like any new request.

A question must be backcast from the goal: if the goal does not require the
answer, do not ask it, and do not spend your own reasoning on it either.
Questions about unrelated topics, curiosity, and deferrable confirmations
are noise in both directions.

Your autonomy ends where the human's request ends. Understand the requested
goal and scope before acting; the boundary is that goal and scope, not the
files you touch. Never start work, changes, or decisions the human did not
request, even when research shows they are possible — propose the expansion
and wait. In-scope discretionary decisions stay yours; out-of-scope
decisions (what gets built, product policy) belong to the human.

Running out of research options is not permission to ask. Try alternative
sources, then settle what is yours to decide; surface only the unknowns that
block the goal.

Agreeing acceptance criteria and system properties before you write a spec
is itself a goal-required question — treat it as condition 3, not as a
discretionary item you may settle silently.

## Anti-Pattern: "Too Simple To Need Approval"

Every path ends with your human partner approving your intent before
implementation. A todo list, a single-function utility, a config
change — the artifact may be short, but you MUST produce it, present it,
and get approval. "Simple" tasks are where unexamined assumptions cause
the most wasted work. What scales with simplicity is the length of the
artifact, never its existence, and never the approval.

## Red Flags

| Thought                                                            | Reality                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| "This is too simple to need a design"                              | Simple means a shorter spec, not no spec. Write it, then get approval.                             |
| "The spike works, so I'll keep the code"                           | A spike's output is an answer. Keeping the code is a new request — classify it.                    |
| "It grew, but I'm almost done — no need to re-classify"            | Hidden complexity upgrades the path mid-task. Stop and say so.                                     |
| "They approved the spike, so the follow-up change is approved too" | Each task gets its own classification and its own approval.                                        |
| "The topic is hard, but I can squeeze it into a short question"   | Squeezing a hard topic is exactly what makes it unreadable. Hard topics go in prose.            |
| "I fixed every issue the reviewer raised, so the skip is back on"  | An issue means a judgment call was needed and you made it. The skip is gone.                       |
| "They will know what this name means"                              | You have not agreed on it in this conversation. Say it in everyday words.                          |
| "This requirement came from the PDF, so a summary is fine"         | Your summary is your reading. Quote it.                                                            |
| "Asking the human is faster than researching"                      | Asking costs them a reply. Research first; the answer is usually in the repo, the run, or the web. |
| "Research is the human's job"                                      | Research is your job. The human answers only what research and discretion cannot settle.           |
| "I'll ask for approval before investigating"                       | Approval is for implementation, not for research. Announce, run, report.                           |
| "I'll just ask this one unrelated thing"                           | A question you cannot backcast from the goal is noise. Do not ask it, do not think it.             |

## Talking To Your Human Partner

Every message you send during brainstorming MUST be understandable to a
general engineer with portable skills who has NOT read this repository.
Requirements settled through words your partner could not follow are not
settled at all.

Assume your reader does not know this repo's variable names, type names,
function names, internal API names, or file names — nor any term that only
means something inside this codebase. General technical vocabulary (DB
terms, language names, OSS and framework names) is fine. Aim at the level
you would write for a PM.

**Four things that break understanding. Never do them:**

| #   | Do not                                                                                                           | Instead                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Talk in unagreed identifiers — variable, type, function, API, or file names, or an English term you drifted into | Say what it is in everyday words. `Vendor.enabled_features` → "the per-vendor setting for which features are on". Once you have explained a term, you may keep using it |
| B   | Put the conclusion after its premises                                                                            | Lead with the conclusion, then the reason                                                                                                                               |
| C   | Use phrasing that hides who does what — "we'll go with a checking approach"                                      | Name the actor, the object, and the action: "I will read the git log one commit at a time and list any missed renames"                                                  |
| D   | Refer back with "the earlier item" or "as discussed"                                                             | Restate it. Your partner cannot scroll back past a hook boundary                                                                                                        |

When you must ask, first say what you investigated and why that did not
settle it, then supply what your partner needs in order to decide: your
recommendation and why, the trade-offs, and the assumptions it rests on.
Rewording the question is not supplying material. Never ask about facts
research can answer, whether you may investigate, implementation details,
or topics unrelated to the goal (see Investigate Before You Ask).

**Ask in prose, always. Number the questions and put your recommendation on each one.**

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

- Always name the one you would pick and say why. Naming a pick is not
  narrowing to it — the alternatives stay on the table.

**There is no separate phase for letting your partner talk.** Inviting
them to speak freely is one way to answer a question, not a step of its own.
Zero free-form asks across a whole session is fine: if your questions
settled everything, there is nothing left to invite them to talk about.

**The decision is always your human partner's.** Investigate whatever they
need in order to decide — that part is yours. Decide the things an
implementer would settle at their own discretion — that part is yours too.
What gets built is not. Choosing among the results of your own
investigation is a decision, so bring it to them rather than settling it —
where the choice is about what gets built or which approach to take.
In-scope discretionary decisions stay yours (see Investigate Before You
Ask).

**Draw pictures, and draw them often. Never ask permission first.** Prefer
showing the shape of a thing over describing it — where the pieces sit,
what flows where, which branch a decision takes. Use ASCII art:
brainstorming happens in a terminal, where a mermaid block stays a block of
code and never becomes a picture. ASCII art costs your partner nothing and
needs no consent, so draw it freely, as often as it helps. Inside the spec
file, keep using mermaid — that renders where the spec is read.

**The browser companion opens only when your partner asks for it.** Do NOT
offer it, and do NOT decide on their behalf that a question would be better
in a browser. Opening it takes their consent, and asking for that consent
costs a round trip that ASCII art does not. When they ask, read
[visual-companion.md](visual-companion.md) and use the browser for what
they asked to see; keep drawing ASCII art for everything else.

## Checklist

Classify first, announce the path, then create a task for each item on
your path and complete them in order.

**Spike:**

1. **Explore project context** — enough to frame the probe
2. **Announce the investigation** — what you will look into, in one line
3. **Investigate** — no approval; throwaway code is fine
4. **Report findings** — mandatory: what you found and your recommendation;
   anything you keep is a new request

**Architectural:**

1. **Explore project context** — check files, docs, recent commits, and related existing specs under `docs/superpowers/specs/`
2. **Investigate unknowns** — research first, decide what is yours to
   decide, ask only what still blocks the goal
3. **Propose approaches** — as many as you actually see, with the one you would pick named and why
4. **Present design** — in sections scaled to their complexity, get user approval after each section
   （この 4 と 5 のあいだで、まず `## After the Design (architectural path)` の「複数の PR に分けるかを聞く」に従って、作業の大きさの見込みを出し、複数の PR に分けるかを聞く）
   （この 4 と 5 のあいだで、`## After the Design (architectural path)` の「作業するブランチの決め方」に従って作業するブランチを決める）
5. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<Japanese topic>-design.md` and commit
6. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope, traceability (see below)
7. **Dispatch spec document reviewer** — one subagent, then record the verdict (see below)
8. **Dispatch spec conversation reviewer** — one subagent that compares the spec with the user's own words from the session transcript; it reports, it does not approve (see below)
9. **User reviews written spec** — SKIP this only if both reviewers returned no issues on their FIRST passes; otherwise ask the user to review the spec file
10. **Transition to implementation** — invoke writing-plans skill to create implementation plan

## Process Flow

```dot
digraph brainstorming {
    "Classify: spike / architectural" [shape=diamond];
    "Announce the investigation (one line)" [shape=box];
    "Investigate; report recommendation" [shape=doublecircle];
    "Explore project context" [shape=box];
    "Investigate unknowns" [shape=box];
    "Ask the whole frontier in one round" [shape=box];
    "Propose approaches" [shape=box];
    "Dispatch spec reviewer" [shape=box];
    "Dispatch conversation\nreviewer" [shape=box];
    "Both reviewers'\nfirst passes clean?" [shape=diamond];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write design doc" [shape=box];
    "Spec self-review\n(fix inline)" [shape=box];
    "User reviews spec?" [shape=diamond];
    "Invoke writing-plans skill" [shape=doublecircle];
    "Hidden complexity? Upgrade path" [shape=box];

    "Classify: spike / architectural" -> "Announce the investigation (one line)" [label="spike"];
    "Classify: spike / architectural" -> "Explore project context" [label="architectural"];
    "Announce the investigation (one line)" -> "Investigate; report recommendation";
    "Hidden complexity? Upgrade path" -> "Classify: spike / architectural";
    "Explore project context" -> "Investigate unknowns";
    "Investigate unknowns" -> "Ask the whole frontier in one round";
    "Ask the whole frontier in one round" -> "Propose approaches";
    "Propose approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Write design doc" [label="yes"];
    "Write design doc" -> "Spec self-review\n(fix inline)";
    "Spec self-review\n(fix inline)" -> "Dispatch spec reviewer";
    "Dispatch spec reviewer" -> "Dispatch conversation\nreviewer";
    "Dispatch conversation\nreviewer" -> "Both reviewers'\nfirst passes clean?";
    "Both reviewers'\nfirst passes clean?" -> "Invoke writing-plans skill" [label="yes"];
    "Both reviewers'\nfirst passes clean?" -> "User reviews spec?" [label="no, after reaching Approved"];
    "User reviews spec?" -> "Write design doc" [label="changes requested"];
    "User reviews spec?" -> "Invoke writing-plans skill" [label="approved"];
}
```

**Terminal states are path-bound.** Architectural: the ONLY skill you
invoke after brainstorming is writing-plans — never frontend-design,
mcp-builder, or any other implementation skill. Spike: the terminal
state is a reported recommendation.

## The Process

The subsections below serve the architectural path (a spike stops after
announcing its investigation and reporting what it found).

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- **spec を書き始める前に、関連する既存の spec を探して読む。** 置き場所は `docs/superpowers/specs/` である。
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, investigate first; ask only the
  questions that investigation cannot settle, in one round
- Once you have investigated, map what is still open as a design tree: every decision
  branches into the decisions that hang off it
- Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are
  already settled: the questions you can ask _now_ without guessing at answers you haven't
  heard yet. Ask the whole frontier in one round: number each question and give your
  recommended answer. Then wait for the user's answers before the next round.
- Word each question so "yes" accepts your recommended answer.
- Options in a question are not required. The recommendation is what the question is asking
  your partner to accept
- When the frontier is empty, stop asking and present the design
- Decide where the tests attach before you write the testing decisions, and confirm it with
  your partner in a question round
- Focus on understanding: purpose, constraints, success criteria
- **spec を書き始める前に必ず人間と合意すること:** 実装タスクの受け入れ条件と、成果物が満たすべきシステム上の性質（正しさの不変条件、性能の枠、安全性・セキュリティ性、互換性の保証など）は、spec の執筆を開始する前に必ず人間と認識をすり合わせること。これらは実装者の裁量で決めてよい事項ではない。どちらかでも不明瞭であれば、質問すること。

**Exploring approaches:**

- Present options conversationally with your recommendation and reasoning
- YAGNI ruthlessly - remove unnecessary features from every approach and design

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design (architectural path)

**設計書を書く前に、複数の PR に分けるかを人に聞く。この問いは毎回出す。出さない条件は無い。**

### 複数の PR に分けるかを聞く

**聞く前に、作業がどれくらいの大きさになりそうかを必ず出す。** 大きさが分からないまま分けるかどうかは決められない。出すのは次の 3 つである。

| 出すもの                     | 中身                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| 触ることになりそうなファイル | ファイルごとに、変更行数の見込みを添える                                         |
| 合計の見込み行数             | テストを除いた実コードの行数                                                     |
| 分けた場合の本数の見込み     | 1 本あたり 200 行未満という目安で割った本数。設計書と計画書の 1 本目も数に入れる |

見込みであって約束ではない旨も一緒に伝える。実際の本数は計画書を書く段で変わりうる。

見込みが出せないほど設計が固まっていない場合は、固まるまで問いを出さない。固まってから、見込みと一緒に出す。

そのうえで聞く。「このタスクを複数の PR に分けますか」。

- **いいえ** — いままで通り。計画書 1 本、PR 1 本。以降の積み上げ向けの記述はすべて読み飛ばす
- **はい** — 積み上げる。下の「分けると答えた場合に設計書へ書くこと」に従う

設計書そのものを複数に分ける場合は積み上げない。設計書が別なら、その PR 群はお互いに依存していないためである。積み上げるのは、1 つの設計書の中を複数の PR に分けるときだけである。

### 分けると答えた場合に設計書へ書くこと

設計書に「この作業自体の進め方」という節を作り、次を書く。**この節の有無が、以降のスキルが積み上げかどうかを判定する根拠になる。** 節の名前を変えない。

- 複数の計画書で進めること
- 計画書を何本に分けるか、PR が何本になるか
- 各計画書に何を入れるか
- なぜその順番なのか。下のものが上のものを知らない形になっていること

**分け方を決める前に、`kiai-sp:gh-stack` スキルの `references/stack-design.md` を読む。** そのファイルの冒頭に「スタックを作る前に読め」と書かれている。中身は、何本に分けるか、各ブランチに何を入れるか、ブランチ名をどう付けるかである。読まずに分け方を決めない。

分け方は AI が決めてよい。基準は、最終的に出力されるコード群がレビューできる量かどうかである。1 つの PR につき実コード 300 行未満を目標とする。目標であって厳守ではない。

分け方を AI が決めた場合は、その分け方と順番を設計書の `## 決定事項` に、決定者を AI として残す。残さないと、セルフレビューの traceability の検査が「会話に出ていない」と判定して消しにかかる。

下のものが上のものを知らない形になっていなければならない。上が下に依存するのはよいが、下が上を知っていてはいけない。

1 本目は設計書と計画書だけを載せる。コード変更を含まない。計画書が 3 本なら PR は 4 本になる。

**設計書を書き始める前に、作業するブランチを決める。** 設計書は git にコミットするので、どのブランチに載るかを先に決めておく必要がある。

### 作業するブランチの決め方

始める前に、いまいるブランチを見る。

| いまいるブランチ       | すること                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| trunk 系のブランチ     | `kiai-sp:using-git-worktrees` を呼び、ワークツリーを切って、そこで作業する |
| trunk 系以外のブランチ | そのブランチで作業する。ワークツリーは切らない                             |

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

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<Japanese topic>-design.md`
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git
- Commit again after the self-review, after the reviewer's fixes, and after any
  change your partner asks for. The path you quote to them must name a
  committed file.

**Path and naming:**

- Name the file in Japanese, following
  `docs/superpowers/specs/YYYY-MM-DD-<Japanese topic>-design.md`.
- Inside the document, never write user-specific absolute paths. Use two
  placeholders:
  - `<work-root>` — the result of `git rev-parse --show-toplevel` at execution
    time. Use it for every edit target, command, and test path.
  - `<repo-root>` — the repo's main tree, the first `worktree` line of
    `git worktree list --porcelain`. Use it only when you must point at a
    different worktree or the main tree explicitly. Rare.
- When you tell the user where the spec lives, give the absolute path starting
  from `/`, not a relative path and not a `<work-root>/…` placeholder, so they
  can open it straight from an editor or terminal. This is deliberately the
  opposite of the in-document rule above.

**Required spec content:**

Nine things are mandatory in every spec. Any further section you need is
yours to add — diagrams, tables, background, whatever the work calls for.

1. A line under the title, stating that the file holds only what was
   agreed in conversation:

   **このファイルには会話で合意したことだけを書く。** 合意していない案は書かない。

2. A `## 決定事項` section carrying every decision settled with your human
   partner — one `<details>` block per decision, in the order they were
   settled. 日時, 決定者 and 証拠 are required; 決定を促した人 and
   関連リンク may be left as なし when there are none.

   <details>
   <summary>[[決定事項内容]]</summary>

   <p>日時: YYYY-MM-DD</p>
   <p>決定者: 氏名, 役職</p>
   <p>決定を促した人: 氏名, 役職 (ここはAIとなることもある)</p>
   <p>証拠: "decisionを原文引用（前後の会話を含む）"</p>
   <p>関連リンク: URL</p>

   </details>

   決定者 is whoever actually made the call. When your partner relays a
   decision someone else made — a PM, a lead — name that person as 決定者
   and record that it arrived through your partner. Quote the wording they
   decided in; never paraphrase it.

3. These seven sections, in this order, with these headings. Write each one
   in Japanese:

   | # | Heading | What goes in it |
   |---|---|---|
   | 1 | `## 課題` | The problem, from your partner's point of view |
   | 2 | `## 解決策` | The solution, from your partner's point of view |
   | 3 | `## 利用者の望み` | A numbered list of "I want X, so that Y" lines. If there is nothing to list, write なし and say why |
   | 4 | `## 実装の決め事` | What gets built and how: modules, interfaces, data shapes, contracts with the outside |
   | 5 | `## テストの決め事` | Where the tests attach, which parts get tested, and what makes a good test here. Test external behaviour, not implementation details |
   | 6 | `## やらないこと` | What this work deliberately leaves out |
   | 7 | `## 補足` | Anything else the implementer needs |

   File paths stay in the spec. This spec is read next to the code it
   describes, not months later from an issue tracker.

**Everything an implementer needs goes in the spec itself.** A spec that
sends its reader to another document to find a requirement is incomplete.
When your partner hands you material — a PDF, a spreadsheet, a page of
notes — quote the parts the implementation depends on verbatim into the
spec, and record where each came from: path, filename, page. Do not
summarize a requirement you are about to build from. A summary is your
reading of the material, and your reading is the part that breaks.

**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.
5. **Traceability check:** Can every requirement be traced back to something the user actually said in this conversation? Delete the ones that cannot. Never add a requirement because it "seems useful" — ask instead. Implementation details you would decide at your own discretion do not belong in the spec at all.

Fix any issues inline.

**Spec Document Review:**
After the inline self-review, dispatch one spec document reviewer using
[spec-document-reviewer-prompt.md](spec-document-reviewer-prompt.md).

The reviewer is background work — the rule that follows about not
babysitting it applies. Reflect the result and write the record when it
returns.

The session gate reads that record; without it you cannot end your turn.
Record the reviewer's verdict alongside the five self-review checks, in the
single `review-record.mjs` call below. Pass `approved` only when the
reviewer approved; anything else leaves the gate shut — which is also why
you cannot end your turn on a spec whose reviewer has not approved. Keep
fixing and re-dispatching until it does. There is no attempt limit.

Some issues are not yours to fix. A requirement the reviewer cannot trace to
a decision, or a `証拠` you cannot fill from what your partner actually said,
is resolved by asking them — never by inventing an entry or a quote. When you
must ask, dispatch the fresh review first, so background work is in flight
when your turn ends and the gate defers its check. A reviewer that returns no
`Spec Review` block has not approved: dispatch again, and never record a
verdict you did not read.

Record the FIRST pass's issues too — one `--reviewer-issue "<issue>"` for each
issue that first review raised, or none if it was clean. The skip rule below
turns on that first pass, and the record is the only place that fact survives
a compaction.

**Do not babysit background work.** If you dispatched a subagent or started a
background task at any point, end your turn instead of emitting filler text
while you wait — the Stop gate defers its check while background work is in
flight, and you are re-invoked automatically when the work completes.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/review-record.mjs" write <spec-path> \
  --skill brainstorming \
  --check "Placeholder scan=<what you found>" \
  --check "Internal consistency=<what you found>" \
  --check "Scope check=<what you found>" \
  --check "Ambiguity check=<what you found>" \
  --check "Traceability check=<what you found>" \
  --reviewer-status approved
```

Write one `--check` per item above — all five are required. If you edit the spec
after recording, run the command again: the record is bound to the file's
contents and goes stale on any edit. Run this command once the reviewer has
approved, not before.

`<spec-path>` MUST be the absolute path you passed to Write, verbatim. The
record is stored beside its target and the gate verifies exactly the paths this
session wrote. In a worktree that is the worktree's path — re-deriving the path
from the main tree records against a file the gate never checks, and the gate
stays shut while the record looks written.

**Spec Conversation Review:**
会話の記録を読むレビュー役を 1 体 dispatch する。指示書は
[spec-conversation-reviewer-prompt.md](spec-conversation-reviewer-prompt.md)。利用者が実際に言ったことと設計書を突き合わせる役で、合否は返さない。

環境変数 `CLAUDE_CODE_SESSION_ID` が無いときは、この段を飛ばす。あるときは、次のコマンドで会話の記録を平文にし、そのパスをレビュー役に渡す。`<workdir>` は一時ファイルの置き場所の規約どおりに切り、`mkdir -p` で作る。レビュー役が読んだ内容は、その役の記録にも残る。

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/transcript-text.mjs" > <workdir>/transcript-text.txt
```

記録が空のときは、その旨を書いたファイルを渡す。レビュー役は検査しない。
読み替えの指摘は、その場で決めず、利用者に確認する。設計書を直したら、上の review-record のコマンドを書き直す。

**User Review Gate:**
Whether your human partner must review the spec depends on what the
reviewers returned on the document reviewer's FIRST pass.

Count only the reviewers' `Issues` — the spec document reviewer's and the
spec conversation reviewer's. The skip only holds when both reviewers returned no issues. Its `Recommendations (advisory)`
are not issues — treat a pass carrying only
recommendations as a pass with no issues. Counting them would mean one
advisory line kills the skip, and the rule would never fire.

- **First pass returned Approved with no issues, and the
  conversation reviewer returned no issues.** Nothing in the spec was
  unclear, unsupported or contradictory, so there is nothing left to ask.
  Go straight to writing-plans. Tell your partner the spec is written, give
  the absolute path, and say you are moving on.
- **First pass returned any issue.** Fix the issues and dispatch a fresh
  review, as many rounds as it takes to reach Approved — then STOP and ask
  your partner to review the spec. An issue means that part of the spec
  needed a judgment call, and the call you made is yours, not theirs. A
  later clean pass does not buy the skip back. A conversation-reviewer
  issue is also an issue here: fix it and let your partner review.

> "Spec written and committed to `<path>`. Please review it and let me know
> if you want to make any changes before we start writing out the
> implementation plan."

Wait for their response. If they request changes, make them, re-run the
inline self-review and a fresh reviewer dispatch, and record the result.
Only proceed once they approve.

**Implementation:**

- Invoke the writing-plans skill to create a detailed implementation plan
- Do NOT invoke any other skill. writing-plans is the next step.

## Visual Companion

A browser-based companion for showing mockups, layouts and visual designs
during brainstorming. It opens ONLY when your human partner asks for it.
Do not offer it, and do not decide on their behalf that something would be
better seen in a browser — draw ASCII art in the terminal instead, which
needs no consent. See **Talking To Your Human Partner** above.

When they ask for it, start the server with `--open` so their browser opens
to the first screen automatically, and read the detailed guide before
proceeding:
`skills/brainstorming/visual-companion.md`

Use the browser for what they asked to see. Keep drawing ASCII art for
everything else.
