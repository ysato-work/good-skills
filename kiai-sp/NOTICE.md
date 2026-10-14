# kiai-sp の由来

このプラグインは [obra/superpowers](https://github.com/obra/superpowers) (MIT License, Copyright (c) Jesse Vincent) のフォーク。

## 取り込み元スナップショット

| 項目 | 値 |
|---|---|
| upstream プラグイン | `superpowers@claude-plugins-official` |
| バージョン | 6.2.0 |
| git commit | `0e5cc50e782429b95f933e46443898435b8b37a8` |
| 取り込み日 | 2026-07-31 |
| 取り込み元パス | `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0` |

## スキル単位の追従状況

プラグイン全体の基準は上表のとおり 6.2.0。個別に追従したスキルはここに書く。

| スキル | upstream 版 | 追従日 |
|---|---|---|
| `brainstorming` | 6.3.0 | 2026-09-01 |

## superpowers 以外からの取り込み

upstream の superpowers には無く、別の配布元から取り込んだスキルをここに書く。

### `skills/gh-stack`

| 項目 | 値 |
|---|---|
| 取り込み元 | https://github.com/github/gh-stack |
| 取り込み元パス | `skills/gh-stack/` |
| git commit | `2bd699a544a09cb5c45a013d03416e0894b0454e` |
| 取り込み日 | 2026-09-22 |
| スキルの `metadata.version` | `0.1.0` |
| ライセンス | MIT License（許諾文の全文は [`LICENSES/gh-stack-LICENSE`](LICENSES/gh-stack-LICENSE) に置いた） |
| 著作権表示 | Copyright GitHub, Inc. |

中身は改変していない。取り込み元が更新された場合は、同じ 4 ファイルを入れ替えて本表の commit を更新する。

### grilling（`brainstorming` に取り込み）

`skills/grilling` というディレクトリは無い。`brainstorming` の本文に問い方を取り込んだ。

| 項目 | 値 |
|---|---|
| 取り込み元 | https://github.com/mattpocock/skills.git |
| 取り込み元パス | `skills/productivity/grilling/SKILL.md` |
| git commit | 記録しない。取り込み元が git のチェックアウトではないため。代わりに `~/.agents/.skill-lock.json` の `grilling` の `skillFolderHash`（28aceb4c9567b985cb47f7db88cf23c9f33af8b8）と `updatedAt`（2026-10-11T11:36:47.428Z）を記録する |
| 取り込み日 | 2026-10-12 |
| ライセンス | MIT License（許諾文の全文は [`LICENSES/grilling-LICENSE`](LICENSES/grilling-LICENSE) に置いた） |
| 著作権表示 | Copyright (c) 2026 Matt Pocock |

`to-spec` からは節の並びと節名の意味だけを取り込み、文は写していない。出典の記載は要らない。

取り込んだ文は `SKILL.md` の `## Investigate Before You Ask` と `**Understanding the idea:**` と `## Talking To Your Human Partner` にある。原文のまま置いた。

## 取り込んだもの

- `skills/` — upstream の 14 スキル（SKILL.md・参照 Markdown・付随スクリプト）をコピー。加えて `subagent-driven-development-workflow` `executing-spec-tests` `generating-spec-tests` は本フォーク独自のスキル（upstream に対応物が無い。`subagent-driven-development-workflow` は `workflow.mjs` と専用テストを持つ）、`gh-stack` は GitHub から取り込んだスキル（上の「superpowers 以外からの取り込み」を参照）で、スキルディレクトリは合計 18 個。**本フォークが改変したのは取り込み元 6.2.0 に対して 9 スキル。** `brainstorming` は Bounded パスの廃止・人間と話すときの作法・問い方のラウンド方式と雛形・spec の必須要素（決定事項一覧と資料の原文引用）・設計書7節の雛形・テストを差し込む場所の確認・spec 検証の subagent 化とゲートでの強制・書き始める前に既存の spec を読む指示。`writing-plans` はセルフレビュー強制と plan reviewer の dispatch・書き始める前に既存の spec を読む指示・人間が実施する作業の扱い・計画書の冒頭テンプレートへのパスの読み方の欄・自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換え。`finishing-a-development-branch` は PR 本文への spec / plan リンクの添付、自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換え、`pr-description` スキルが使える環境では PR 作成をそのスキルに委譲する分岐、マージ・破棄の前に元のフォルダへ移る手順を `ExitWorktree` 優先に置き換え。`subagent-driven-development` は、作業するブランチの決め方（trunk 系のブランチならワークツリーを切り、それ以外ならそのブランチで作業する）を Setup 節に追記し、自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換え。`executing-plans` は、無条件にワークツリーを作る 1 行を、同じ決め方に置き換え、自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換え。`systematic-debugging` `test-driven-development` `using-superpowers` `writing-skills` の 4 つは、自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換えだけ。残る 5 スキルは 6.2.0 から無改変。なお `brainstorming` だけ 6.3.0 に追従済みのため（上表参照）、6.3.0 と比較すると `using-superpowers` `subagent-driven-development` `writing-skills` `requesting-code-review` にも差分が出る。このうち upstream 側の変更由来の差分は本フォークの改変ではない。加えて `brainstorming` `writing-plans` `subagent-driven-development` `executing-plans` `finishing-a-development-branch` の 5 つには、1 つの設計書を複数の PR に分けて積み上げるときの分岐を追記している。分岐の中身が効くのは、分けると答えたときだけである。ただし `brainstorming` では、問いそのものと作業の大きさの見込みの提示が毎回出るため、そこだけは分けないと答えた場合も追記前と動きが違う。
- `hooks/` — SessionStart で `using-superpowers` を注入するフック（注入する文の中のスキル名を `kiai-sp:` 接頭辞に書き換え）
- `LICENSE` — upstream の MIT ライセンス
- `lib/` `hooks/gate-*` — セルフレビュー強制ゲート（upstream には無い kiai-sp 独自の追加）
- `lib/worktree-guard.mjs` `hooks/worktree-guard` — kiai-sp のスキルを起動した会話でだけ、worktree の外への操作と trunk 系ブランチでの push を止めるフック（upstream には無い kiai-sp 独自の追加）

## 取り込まなかったもの

upstream リポジトリの開発用・他ハーネス用の資産は対象外とした。

- `.codex-plugin/` `.cursor-plugin/` `.opencode/` `.pi/` `.kimi-plugin/` `.agents/` `gemini-extension.json` `GEMINI.md` — Claude Code 以外のハーネス向け
- `tests/` `scripts/` `docs/` `.github/` `README.md` `RELEASE-NOTES.md` `CLAUDE.md` `package.json` — upstream リポジトリの開発・リリース運用用

## Claude Code 最適化の残タスク

コピー時点では未着手。

- `skills/using-superpowers/references/{codex,pi,antigravity,gemini}-tools.md` は他ハーネス向けなので削除候補
- `skills/using-superpowers/SKILL.md` の Platform Adaptation 節は Claude Code のみなら不要
- `hooks/hooks-cursor.json` `hooks/run-hook.cmd` は Cursor / Windows 向けなので削除候補
- `skills/brainstorming/scripts/server.cjs:540` が `cp.exec` でブラウザ起動している。`BRAINSTORM_OPEN_CMD` はオペレータ設定の環境変数、`url` はサーバ生成トークン由来なので現状は攻撃者制御下にないが、`cp.execFile` に置き換えればシェルを経由せず済む
- `skills/brainstorming/scripts/helper.js:32` の `websocketUrl()` がセッションキーをクエリ文字列に載せている。`server.cjs` は既にキーを HttpOnly cookie にミラーしているので、クエリを削って cookie 認証に一本化できる（現状は `127.0.0.1` バインド + Origin チェックありで実害は小さいが、キーが履歴・プロキシログに残る）
- グローバル `~/.claude/CLAUDE.md` の TDD 規定は「例外なし」だが、`skills/writing-plans/SKILL.md` はデリバラブルがコードでないタスク（ドキュメント・設定・プロンプト文言）を実装タスクの対象外としている。これはユーザー判断による意図的な既知の乖離であり、プラグイン側の文言が正しくグローバル側が過剰。将来グローバル側のコピーを整理する際にこの緩和を黙って締め直さないこと
