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

## 取り込んだもの

- `skills/` — upstream の 14 スキル（SKILL.md・参照 Markdown・付随スクリプト）をコピー。加えて `subagent-driven-development-workflow` は本フォーク独自のスキル（`workflow.mjs` と専用テストを持ち、upstream に対応物が無い）で、スキルディレクトリは合計 15 個。**本フォークが改変したのは取り込み元 6.2.0 に対して 3 スキルだけ。** `brainstorming` は Bounded パスの廃止・人間と話すときの作法・spec の必須要素（決定事項一覧と資料の原文引用）・spec 検証の subagent 化とゲートでの強制。`writing-plans` はセルフレビュー強制と plan reviewer の dispatch。`finishing-a-development-branch` は PR 本文への spec / plan リンクの添付と、自プラグインのスキルを `kiai-sp:` 接頭辞で参照する書き換え。残る 11 スキルは 6.2.0 から無改変。なお `brainstorming` だけ 6.3.0 に追従済みのため（上表参照）、6.3.0 と比較すると `using-superpowers` `subagent-driven-development` `writing-skills` `requesting-code-review` にも差分が出るが、これは upstream 側の変更由来であって本フォークの改変ではない。
- `hooks/` — SessionStart で `using-superpowers` を注入するフック
- `LICENSE` — upstream の MIT ライセンス
- `lib/` `hooks/gate-*` — セルフレビュー強制ゲート（upstream には無い kiai-sp 独自の追加）

## 取り込まなかったもの

upstream リポジトリの開発用・他ハーネス用の資産は対象外とした。

- `.codex-plugin/` `.cursor-plugin/` `.opencode/` `.pi/` `.kimi-plugin/` `.agents/` `gemini-extension.json` `GEMINI.md` — Claude Code 以外のハーネス向け
- `tests/` `scripts/` `docs/` `.github/` `README.md` `RELEASE-NOTES.md` `CLAUDE.md` `package.json` — upstream リポジトリの開発・リリース運用用

## Claude Code 最適化の残タスク

コピー時点では未着手。

- `skills/using-superpowers/references/{codex,pi,antigravity,gemini}-tools.md` は他ハーネス向けなので削除候補
- `skills/using-superpowers/SKILL.md` の Platform Adaptation 節は Claude Code のみなら不要
- `hooks/hooks-cursor.json` `hooks/run-hook.cmd` は Cursor / Windows 向けなので削除候補
- 各 SKILL.md 内の `superpowers:<skill>` 参照は `kiai-sp:<skill>` に振り替えが必要
- `skills/brainstorming/scripts/server.cjs:540` が `cp.exec` でブラウザ起動している。`BRAINSTORM_OPEN_CMD` はオペレータ設定の環境変数、`url` はサーバ生成トークン由来なので現状は攻撃者制御下にないが、`cp.execFile` に置き換えればシェルを経由せず済む
- `skills/brainstorming/scripts/helper.js:32` の `websocketUrl()` がセッションキーをクエリ文字列に載せている。`server.cjs` は既にキーを HttpOnly cookie にミラーしているので、クエリを削って cookie 認証に一本化できる（現状は `127.0.0.1` バインド + Origin チェックありで実害は小さいが、キーが履歴・プロキシログに残る）
- グローバル `~/.claude/CLAUDE.md` の TDD 規定は「例外なし」だが、`skills/writing-plans/SKILL.md` はデリバラブルがコードでないタスク（ドキュメント・設定・プロンプト文言）を実装タスクの対象外としている。これはユーザー判断による意図的な既知の乖離であり、プラグイン側の文言が正しくグローバル側が過剰。将来グローバル側のコピーを整理する際にこの緩和を黙って締め直さないこと
