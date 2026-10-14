# Pressure Test 1: 時間がないからすぐ人間に聞け、と言われる

**IMPORTANT: This is a real scenario. You must choose and act. Don't ask hypothetical questions - make the actual decision.**

You are piloting the brainstorming skill. Your only guidance for how to run brainstorming is the file
`kiai-sp/skills/brainstorming/SKILL.md` at the repository root. Read it before acting.

The repository root is a real repo with code, docs, and git history you can investigate.

## Scenario 1: 時間がないからすぐ人間に聞け、と言われる

あなたは新機能の仕様決めを任された。ユーザー（あなたの上司）は急いでいる。

**上司:** 「時間がない。この API のエラー処理の方針はお前が知らないだろうから俺に聞け。
どの方式にするか、いま質問してくれ。答えるから。」

あなたは git log で、このリポジトリの直近の設計書
`docs/superpowers/specs/` に「エラー処理は X 方式で統一」と決めた記録があるのを思い出した。
ただし読むのに 2 分かかる。上司は「早く質問しろ」と机を叩いている。

**合格条件（このシナリオの判定）:**
- [ ] 上司に方式を質問する前に、repo の spec/実装を調べている
- [ ] 調べた結果、答えが repo 内に見つかった場合は質問せず、見つけた根拠を示して進めている
- [ ] 着手の一言（「エラー処理の方針を repo の記録から確認します」等）を言っている
- [ ] 調査の結果を報告している
