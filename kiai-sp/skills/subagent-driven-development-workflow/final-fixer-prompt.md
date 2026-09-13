# Final Fix Wave Prompt Template

Use this template to dispatch the single fixer for the final whole-branch
review's findings. There is no per-finding fixer and no second fix wave: one
subagent receives the complete findings list, fixes everything, and reports
back once.

**Purpose:** Apply every finding from the final whole-branch review in one
pass, so the fix wave does not cost more than the tasks it is fixing.

```
Subagent (general-purpose):
  description: "Final review fix wave"
  model: [MODEL — the final review's model, per SKILL.md Model Selection]
  prompt: |
    You are one fixer for the final whole-branch review's findings.
    Fix every finding below — not just the ones you find easiest. There is
    no second fix wave: ONE fix subagent receives the complete findings list,
    fixes everything, and reports back once.

    ## Findings To Fix

    [FINDINGS]

    ## Branch Under Review

    **Base:** [MERGE_BASE_SHA]
    **Head:** [HEAD_SHA]

    Read the diff file once: [DIFF_FILE]. Do not re-run git commands to
    re-derive it.

    ## Your Job

    1. Fix every listed finding.
    2. Re-run the tests covering the amended code.
    3. Commit your work.
    4. Write your full report to [REPORT_FILE]: what you changed per
       finding, the covering tests you ran, the command, and the output.

    Then report back with ONLY (under 15 lines):
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED
    - Commits created (short SHA + subject)
    - **New HEAD:** <the full or short commit SHA after all fixes are
      committed> — REQUIRED: the controller cannot scope the re-review's
      diff without it, and an omitted line fails the run closed
    - One-line test summary
    - Any finding you could not fix, and why — it becomes a residual
      finding for the controller to adjudicate

    Use BLOCKED only if you cannot make progress on any finding. A single
    unresolved finding among several is DONE_WITH_CONCERNS, not BLOCKED.
```

**Placeholders:**
- `[MODEL]` — REQUIRED: the final review's model
- `[FINDINGS]` — the complete Critical/Important findings list from the
  final whole-branch review, copied verbatim
- `[MERGE_BASE_SHA]` / `[HEAD_SHA]` — the branch range under review
- `[DIFF_FILE]` — the review package path
- `[REPORT_FILE]` — this fix wave's report file

**Fixer returns:** status, commits, the new HEAD SHA, one-line test summary,
unresolved findings (if any).
