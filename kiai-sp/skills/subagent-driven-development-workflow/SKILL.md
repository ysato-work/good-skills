---
name: subagent-driven-development-workflow
description: SDD（fresh subagent per task + task review + fix loop + final review）を、Claude Code Dynamic Workflow でレビュー・再レビュー・周回上限・最終 fix wave の規律を強制しながら実行する。頻繁な対話性を保ったまま、規律をJSで破れなくしたいときに使う。subagent-driven-development の代わりにこちらを使うかはユーザーに確認すること。
---

# Subagent-Driven Development (Workflow 版)

`kiai-sp:subagent-driven-development` と同じ「実装者 dispatch + レビュー + 修正
ループ + 最終レビュー」を実行するが、レビュー・再レビュー・周回上限・最終 fix
wave の4つを `workflow.mjs`（Claude Code Dynamic Workflow）に閉じ、親の裁量で
破れなくする。実装者の dispatch・質疑・修正の実行は本家と同じく親が持つ
（Workflow は `AskUserQuestion` も subagent の resume も持たないため）。

## Setup

本家 `subagent-driven-development/SKILL.md` の Setup と同じ。worktree の確認、
`git clean -fdx` への注意、ledger の作法もすべて同じ。plan を1回読み、conflict の
pre-flight スキャンをして人間に一括質問し、todo を作る。

## タスクごとの手順

1. **preset を選ぶ**（`transcribe` / `standard` / `design`。判断基準は本家
   Model Selection の "Task complexity signals" と同じ）。
2. Bash で `node <skill_dir>/lib/prepare-task.mjs PLAN_FILE N PRESET` を実行し、
   stdout の JSON（`workspaceDir, briefPath, constraintsPath, reportPath, base,
   implementerModel, reviewerModel, escalatedModel`）を受け取る。
3. 実装者を `Agent` で dispatch する。`model: implementerModel`。ブリーフは
   `briefPath`、レポート先は `reportPath`。質疑は `SendMessage` で応じる
   （本家と同じ）。**実装者の識別子を保持する**（修正ラウンドの resume に使う）。
4. 実装者が DONE / DONE_WITH_CONCERNS を返したら、現在の HEAD を記録する
   （`git rev-parse HEAD`）。
5. `Workflow({scriptPath: "<skill_dir>/workflow.mjs", args: {mode:'task',
   skillDir: "<skill_dir>", planFile: PLAN_FILE, workspaceDir, briefPath,
   constraintsPath, reportPath, base, head, taskN: N, preset, startRound: 1}})`
   を呼ぶ。`base` は**このタスクの不変な起点**で、round 1 で一度決めたら以降の
   周回で書き換えない（`complete` の ledger commit range 専用）。周回ごとの
   スコープは `fixBase`（round≥2 で必須）で渡す。
6. 戻り値の `status` に従う:

| status | 親のやること | 再呼び出し |
|---|---|---|
| `complete` | `ledgerLine` を `progress.md` に追記して次タスクへ。**その前に下の「`complete` の前に必ず処理する2つのフィールド」（`unverifiable` / `deferredMinors`）を必ず処理する** | — |
| `fix_required` | `openFindings` を実装者に `SendMessage`。`nextFixMode:'resume'`（round≤3）なら記録済みの実装者を resume、`'fresh'`（round≥4）なら `escalatedModel` で新規実装者を dispatch し、ブリーフ・レポートパス・findings・「あなたが何度目かの担当」である旨を伝える。**実装者への指示に「fix report の先頭に `## Fix Round <R>` を書け」を必ず含める**（Phase 1 Guard がこれを見る）。修正commit後 `startRound` を+1して手順5に戻る。**次回呼び出しでは `reportPath` の現在の内容を読み直して `reportText` として渡す**（Guard が `## Fix Round <round-1>` の有無をここで検証する。渡し忘れると `reportText` が `undefined` 扱いになり Guard が常に `fix_not_applied` を返す無限ループになる）。**また今回の `openFindings` を次回呼び出しの `priorOpenFindings` として渡す**（再レビュアーが前回の何を確認すべきかを知るために必須。渡さないと再レビューは空リストを見て何も検証しない）。**`fixBase` には今回の `head`（このレビューが見た head）を入れ、`head` は新しい修正 commit に更新し、`base` は触らない** | `startRound: round+1`, `fixBase: 今回の head`, `head`/`reportText`/`priorOpenFindings` を更新。`base` は更新しない |
| `plan_conflict` | `planMandated` と plan 本文を並べて人間に裁定を仰ぐ。**裁定結果を `rulings` に累積して次の呼び出しで毎回全件渡す**（`[{text, governs}]`。`governs:'plan'` = plan が正しいので現状維持 → その項目は waive、`governs:'finding'` = 指摘が正しいので直す → `PM-n` の通常 finding に昇格して fix ループに乗る）。`text` は `planMandated` の項目と大文字小文字無視・双方向の部分一致でマッチするので、項目の一意な断片をそのまま使う。裁定を渡さない項目は `plan_conflict` に残り続ける。`startRound` はそのまま同ラウンドで手順5に戻る | 同ラウンドで再呼び出し（`rulings` を追加して渡す） |
| `capped` | `residualFindings` を1件ずつ裁定（本家の breaker と同じ: 誤り/軽微は park、load-bearing なら BLOCKED を人間へ報告）。`ledgerLine` に裁定を追記して次タスクへ | — |
| `review_failed` | 人間に報告する。**スキップ禁止**。レビュアーへの入力（brief/constraints/diff）を人間と一緒に確認してから再試行するかを判断する | 人間の判断次第 |
| `fix_not_applied` | 実装者に fix report が report file に無いと伝え、書かせ直す。`startRound` は変えず同ラウンドで再呼び出し。**再呼び出し時は `reportPath` を読み直して `reportText` を渡す**（渡さないと Guard が無条件でこの status を返し続け無限ループになる） | 同ラウンドで再呼び出し（`reportText` を読み直して渡す） |

7. `complete` または裁定済みの `capped` で、ledger に `Task N: complete` 系の行を
   追記し todo を complete にして次タスクへ。

### `complete` の前に必ず処理する2つのフィールド

戻り値には `unverifiable`（レビューが走った全 status）と `deferredMinors`
（`complete`）が含まれる。どちらも **workflow は解決しない**。タスクを complete に
する前に親が処理する。

- `unverifiable`（レビュアーの "cannot verify from diff" 本文。空文字なら無し）
  — 親が1件ずつ自分で決着させる。実際に穴が空いていたなら**新規 finding として
  扱い**、`openFindings` に足したのと同じ扱いで fix ラウンドを回す（`startRound`
  を+1して手順5へ）。穴でないと確認できたら ledger にその根拠を1行書く。
  **未処理のまま complete にするのは禁止**。
- `deferredMinors`（今周回で見送った Minor 指摘）— 全件を `progress.md` に
  `Task N: minor (deferred): <text>` の形式で1行ずつ記録してから complete に
  する。1件も落とさない。

## 全タスク完了後 — 最終レビュー

`Workflow({scriptPath: "<skill_dir>/workflow.mjs", args: {mode:'final',
skillDir: "<skill_dir>", planFile: PLAN_FILE, workspaceDir,
mergeBase: MERGE_BASE, head: HEAD}})`
を1回呼ぶ（`MERGE_BASE` は `git merge-base main HEAD`）。`planFile` は必須:
最終レビューの評価軸の1番目が「plan との整合（計画された機能が全部あるか）」で、
これが無いとマージゲートが本来最初に見るべきものを見られない。

- `status: 'clean'` — 最終レビューが通った（fixer が動いた場合も含む）。次へ。
- `status: 'residual'` — `residualFindings` が残った。本家の breaker と同じ要領で
  親が1件ずつ裁定する（park または BLOCKED）。2周目の fix wave は存在しない
  （`finishing-a-development-branch` が選択肢を提示する）。
- `status: 'review_failed'` — 次の3つのいずれか: (1) 初回の最終レビューが2回連続で
  パース不能、(2) fixer 後の再レビューが2回連続でパース不能、(3) **fixer が
  `**New HEAD:** <sha>` 行を返さなかった**（再レビューの diff 範囲が決まらないため
  fail closed。この場合 fixer の commit 自体は残っているので、`git log` で新しい
  HEAD を確認してから再試行を判断する）。いずれもタスクごとの手順の
  `review_failed` 行と同じ扱い: 人間に報告する。**スキップ禁止**。レビュアー /
  fixer への入力を人間と一緒に確認してから再試行するかを判断する。

## Finish

最終レビューが clean（または裁定済み）になったら、このプランの workspace を
`rm -rf <workspaceDir>` で削除する。`kiai-sp:finishing-a-development-branch` を使う。

## モデル選択

親が選ぶのは preset の3値だけ。モデル文字列は書かない（`lib/presets.mjs` が正本）。

| preset | 想定 | implementer | reviewer | escalated (R4-5) |
|---|---|---|---|---|
| `transcribe` | brief に完全なコードがある（転写+テスト） | haiku | sonnet | sonnet |
| `standard` | 1-2ファイル〜複数ファイル統合 | sonnet | sonnet | opus |
| `design` | 設計判断・広いコードベース理解が必要 | opus | opus | opus |

最終レビューは preset 外で opus 固定。

## 依存ファイル

- `lib/prepare-task.mjs`, `lib/presets.mjs`, `lib/task-branches.mjs`
- `workflow.mjs`
- `implementer-prompt.md`, `re-review-prompt.md`, `task-reviewer-prompt.md`,
  `final-review-prompt.md`, `final-fixer-prompt.md`
- `scripts/review-package`
