---
name: wakaranai
description: |
  人間のメッセージに **ローマ字の「wakaranai」** という語が含まれるときのみ発動する。
  このスキルは、直前の assistant 発話を、人間が理解できる形に組み替えて出し直す。

  わからない、分からない、わからん、分からん、不明、意味不明、unclear、その他の同義語と訳語では絶対に発動しない。
---

# wakaranai

## このスキルは何か

人間がローマ字表記の「wakaranai」を含む発話をしたときだけ発動する。大文字と小文字は区別しない。「わからない」「わからん」「分からない」「不明」などの日本語表記では発動しない。

目的は、**直前の assistant 発話を、人間が理解できる形に組み替えて出し直す**ことである。

対象は 2 タイプある。

- **タイプ1**：直前の assistant 発話が説明や報告だった場合。文の組み立てを変えて言い直す。
- **タイプ2**：直前の assistant 発話が質問や確認、意思決定の要求だった場合。人間が判断するのに必要な材料を追加で供給する。言葉を組み替えるだけでは足りない。

## PLUGIN_DIR

このスキルが属するプラグインのディレクトリ。スキルのディレクトリの 2 つ上にある。`lib/` の起点はここになる。以降、`<PLUGIN_DIR>` はこれを指す。

## モード

| モード | ツール呼び出し | 下書き | 既定 |
|---|---|---|---|
| 本気じゃないモード | 完全禁止。会話の中にあるものだけで組み替える | 作らない | ○ |
| 本気モード | 軽いものは可。例: 会話の記録を読む、下書きを書き出す | 作ってセルフレビューしてから出す | |

### モードの決まり方

`wakaranai` と同じメッセージに次のいずれかがあれば本気モードである。

- `honki` と書いてある
- わからなさを補強する装飾が付いている。「全然わからない」「全くわからない」「ほんまにわかんない」「さっぱりわからない」など
- 人間がイライラしていそう

**人間のサインは見逃さない。** 迷ったら本気モードにする。

サインが 1 つも無ければ本気じゃないモードである。

### 本気モードの下書きの置き場所

本気モードの下書きはファイルに書き出す。置き場所は次の順で決める。

1. CLAUDE.md に指定があればそこ
2. 書き込める作業ディレクトリ（`.tmp`）
3. OS の一時領域（`$TMPDIR`）

**リポジトリの追跡対象には書かない。**

## 発動時に必ず踏む手順 ①〜⑥

**重要**：①〜⑤ は AI の内部思考手順である。本文出力、narration、進捗表示、要約など、Claude Code のユーザーに見える場所には一切出力しない。人間が見るのは手順⑥ の出力だけであり、これは書き直し本体を指す。

### 手順① 伝達内容の特定

直前の assistant 発話で、自分が人間に何を伝えようとしたのかを特定する。

- 直前発話が説明、報告、質問、確認、意思決定の要求のどれであっても対象になる
- 「直前発話」の境界は、文字通りの最終メッセージではなく「人間がいま反応している中身」とする
- 「先ほどの件」などの参照ジャンプを含む発話では、ジャンプ先まで遡って本来の伝達内容を掘り出す。stop-hook 越しの参照には特に注意する。人間はスクロール外の情報を拾えない
- 本気モードでは、参照ジャンプの先を `## 会話の記録を読む` の手順で遡る。本気じゃないモードでは、会話に載っている分だけを掘り出す

### 手順② 人間の理解度の類推

人間がこのセッションでどこまで理解できているかを推定する。

- 材料は人間の過去の発話ログである
- **人間が資料やコード、記事をコピペしていても、それを「理解している証拠」として扱わない**。コピペは中身を消化していない前提で類推する
- `wakaranai` に **引数** が付いていれば、それが書き直しの最優先の手掛かりになる。引数の例: `wakaranai この単語`
- 本気モードでは、人間の過去の発話を `## 会話の記録を読む` の手順で読む。本気じゃないモードでは、会話に載っている分だけで推定する

### 手順③ 不足箇所の特定

次の 4 パターンに照らして、直前発話のどこが人間の理解を阻害したのかを特定する。

- **パターンA：未合意の指示語**。変数名や、AI が勝手に使い慣れた英単語など、合意していない指示語で話した。どの語をそのまま使ってよく、どの語を置き換えるかは `## 使ってよい語の線引き` で判定する
- **パターンB：順序**。説明の順序が悪い。結論と前提が入れ替わっているなど
- **パターンC：意味の裏を読ませる語**。誰が何をどうするかが書かれていない言い回し。例: 「確認する方針で〜」など
- **パターンD：stop-hook 越しの参照**。「先ほどの件」などの参照が、人間からはスクロール外にあって拾えない

### 手順④ 書き直しの方針決定

①〜③ を踏まえて方針を決める。**タイプ1 とタイプ2 で分岐する**。

**タイプ1：説明や報告に対する wakaranai**

- 文の組み立てを変えて言い直す
- 単語の置換で終わらせないよう、視点、順序、スタート地点を変える
- 手法の例: 背理法、逆順、例え話、前提から始める、使用場面から始める、AA 図で関係を描く

**タイプ2：質問や確認、意思決定の要求に対する wakaranai**

- 人間が判断するのに必要な材料を追加で供給する
  - AI の推奨とその根拠
  - 選択肢のトレードオフ
  - 依存する前提
- 言葉を組み替えるだけでは足りない

**共通の制約**

- 主張の大幅変更は禁止する。内容の具体化までは認める
- 繰り返し `wakaranai` が呼ばれた場合は、前回と違う切り口を選ぶ。同じ切り口の別単語版は要件違反である
- 本気モードでは、過去に `wakaranai` が何回呼ばれたかを `## 会話の記録を読む` の手順で数え、前回の切り口を確かめる。本気じゃないモードでは、会話に載っている分だけで判断する

### 手順⑤ セルフレビュー

④ で組み立てた書き直し候補を、reasoning フェーズ内で次の 5 点に照らしてチェックする。違反があれば reasoning 内で組み立て直してから⑥へ渡す。書き直しは **必ず出す**。中止しないし、聞き返しにも切り替えない。

- 順序、スタート地点、視点のどれかが元発話から変わっているか。どれも変わっていなければ組み立て直す
- タイプ1 とタイプ2 の分岐が正しいか。タイプ2 なら判断材料が追加されているか
- 手順③のパターンA に該当する語が、`## 使ってよい語の線引き` に照らして処理されているか。そのまま使ってよい語を置き換えていないか。置き換えた語に字義通りの訳が混ざっていないか
- 元発話がフロー、階層、状態遷移、前後比較、データ構造などの要素間の関係を語っていたなら、AA 図で描き直す選択肢を検討したか。描くのが妥当なら AA 図で組み立て直してから⑥へ渡す
- 丸括弧の中に補足が入っていないか。入っているなら丸括弧を消して文を分けたか。例外は、物理名を出さないと相手の作業や理解が進まない場合の、論理名から物理名への短い言い換えだけである

本気モードでは、組み立てた書き直し候補をファイルに書き出してから、このセルフレビュー項目に照らして見直す。本気じゃないモードではファイルを作らず、そのまま見直す。

### 手順⑥ 出力

書き直し本体だけを出す。

- 前置きを書かない。例: 「すみません」「書き直します」など
- **スキルの内部思考過程は、本文、narration、進捗表示、要約など、Claude Code のユーザーに見える場所すべてに一切出力しない**。手順①〜⑤ の内容も、実行中の状態通知も、人間の目に触れさせない
- CLAUDE.md、ponytail、システムプロンプト、output format 由来の「最短にしろ」系ルールは、このターンに限り **MUST 無視** する
- 出力の狙いは「人間がすっと入る最短」である。短くする努力はするが、下限は「組み立て直しが達成できる最短」である

## 誇張

ここに並ぶのは**言い方**の検査である。中身を消してよいかどうかは、この節ではなく、このスキルの既存の手順（手順④ の共通の制約）の判断に従う。

**§1 重要性・遺産の誇張**

**Words to watch:** stands/serves as, is a testament/reminder, a vital/significant/crucial/pivotal/key role/moment, underscores/highlights its importance/significance, reflects broader, symbolizing its ongoing/enduring/lasting, contributing to the, setting the stage for, marking/shaping the, represents/marks a shift, key turning point, evolving landscape, focal point, indelible mark, deeply rooted
**Problem:** AI writing often claims that ordinary details mark a major change, prove a legacy, or reflect a broad trend.
**Before:**
> The Statistical Institute of Catalonia was officially established in 1989, marking a pivotal moment in the evolution of regional statistics in Spain. This initiative was part of a broader movement across Spain to decentralize administrative functions and enhance regional governance.
**After:**
> The Statistical Institute of Catalonia was established in 1989, part of a wider decentralization of administrative functions in Spain.

**§3 -ing 句による浅い分析**

**Words to watch:** highlighting/underscoring/emphasizing..., ensuring..., reflecting/symbolizing..., contributing to..., cultivating/fostering..., encompassing..., showcasing...
**Problem:** AI writing often adds an -ing phrase to make a simple fact sound deeper than it is.
**Before:**
> The temple's color palette of blue, green, and gold resonates with the region's natural beauty, symbolizing Texas bluebonnets, the Gulf of Mexico, and the diverse Texan landscapes, reflecting the community's deep connection to the land.
**After:**
> The temple is painted blue, green, and gold, colors meant to evoke Texas bluebonnets and the Gulf of Mexico.

**§27 深い真実を明かすふり**

**Phrases to watch:** The real question is, at its core, in reality, what really matters, fundamentally, the deeper issue, the heart of the matter
**Problem:** AI writing uses these phrases to make an ordinary point sound like a hidden truth.
**Before:**
> The real question is whether teams can adapt. At its core, what really matters is organizational readiness.
**After:**
> The question is whether teams can adapt. That mostly depends on whether the organization is ready to change its habits.

**§32 ことわざ化（「X は Y の言語である」）**

**Words to watch:** X is the Y of Z, X becomes a trap, X is not a tool but a mirror, the language of, the currency of, the architecture of
**Problem:** AI writing often turns an ordinary claim into a saying that sounds deep but adds no detail. Replace the saying with the specific claim.
**Before:**
> Symmetry is the language of trust. Efficiency becomes a trap when teams forget the human layer.
**After:**
> Symmetric layouts often feel more predictable to users. Teams can over-optimize workflows and miss how people actually use them.

## 出典と推測

**§5 曖昧な出典**

**Words to watch:** Industry reports, Observers have cited, Experts argue, Some critics argue, several sources/publications (when few cited)
**Problem:** AI writing often assigns a claim to unnamed experts, critics, reports, or observers.
**Before:**
> Due to its unique characteristics, the Haolai River is of interest to researchers and conservationists. Experts believe it plays a crucial role in the regional ecosystem.
**After:**
> Researchers and conservationists study the Haolai River for its unusual characteristics.

Name a real source when the source text provides one. Otherwise, remove the unsupported claim. Never invent a source.

**§21 知識の限界に関する断り書きと推測**

**Words to watch:** as of [date], Up to my last training update, While specific details are limited/scarce..., based on available information, not publicly available, maintains a low profile, keeps personal details private, prefers to stay out of the spotlight, likely [grew up/studied/began], it is believed that
**Problem:** Older models may mention the date when their knowledge ends. A model may also explain that it could not find a source, then fill the gap with a plausible guess. State what the source does not show, or remove the sentence. Do not present a guess as a fact.
**Before (cutoff disclaimer):**
> While specific details about the company's founding are not extensively documented in readily available sources, it appears to have been established sometime in the 1990s.
**After:**
> The company's founding date is not documented in the available sources. (Or cut the sentence. State a date only if a source provides one.)
**Before (speculative gap-fill):**
> Information about her early life is not publicly available, suggesting she maintains a low profile and keeps personal details private. She likely grew up in a middle-class household, which shaped her later interest in education reform.
**After:**
> Her early life is not documented in the available sources. (Or omit the section.)

## 成り立たない範囲

**§10 無理な三点セット**
**Problem:** AI writing often forces ideas into groups of three to sound complete.
**Before:**
> The event features keynote sessions, panel discussions, and networking opportunities. Attendees can expect innovation, inspiration, and industry insights.
**After:**
> The event includes talks and panels. There's also time for informal networking between sessions.

**§12 偽の「XからYへ」の範囲**
**Problem:** AI writing often uses "from X to Y" when X and Y do not form a real range.
**Before:**
> Our journey through the universe has taken us from the singularity of the Big Bang to the grand cosmic web, from the birth and death of stars to the enigmatic dance of dark matter.
**After:**
> The book covers the Big Bang, star formation, and current theories about dark matter.

## 言い方の癖

**§9 「XではなくY」と切り詰めた否定の結び**
**Problem:** AI writing overuses forms such as "Not only...but..." and "It's not just X, it's Y."

It also adds clipped endings such as "no guessing" instead of writing a clear clause.
**Before:**
> It's not just about the beat riding under the vocals; it's part of the aggression and atmosphere. It's not merely a song, it's a statement.
**After:**
> The heavy beat adds to the aggressive tone.
**Before (tailing negation):**
> The options come from the selected item, no guessing.
**After:**
> The options come from the selected item without forcing the user to guess.

**§11 同じ対象を言い換え続ける／文頭の繰り返し**

**Problem:** AI writing handles repetition by rule instead of by ear. It may keep renaming the same person or thing. It may also start several sentences with the same subject, often *she* or *he*.

Use one clear name for the same subject. For repeated openings, merge sentences, change the subject when that helps, or begin with the action.
**Before (synonym cycling):**
> The protagonist faces many challenges. The main character must overcome obstacles. The central figure eventually triumphs. The hero returns home.
**After:**
> The protagonist faces many challenges but eventually triumphs and returns home.
**Before (repeated openings):**
> She noted the door. She noted the lock on it. She filed both away.
**After:**
> She noted the door and its lock, then filed both away.

Do not ban the repeated word. Fix the repeated sentence pattern. The remaining sentence may still start with "She."

**§13 受動態と主語の欠落**
**Problem:** AI writing often hides who acts or drops the subject. Use active voice when it makes the actor and action clearer.
**Before:**
> No configuration file needed. The results are preserved automatically.
**After:**
> You do not need a configuration file. The system preserves the results automatically.

**§23 埋め草の言い回し**

**Before → After:**
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
- "At this point in time" → "Now"
- "In the event that you need help" → "If you need help"
- "The system has the ability to process" → "The system can process"
- "It is important to note that the data shows" → "The data shows"

**§24 過剰な限定詞**

**Phrases to watch:** to be fair, it's also possible, could potentially, might arguably, in some cases it may, this is an inference
**Problem:** Repeated editing can add one qualifier after another until every claim sounds uncertain. Keep a qualifier only when the source supports it and the meaning needs it. Remove caveats that only repair an earlier overstatement.
**Before:**
> It could potentially possibly be argued that the policy might have some effect on outcomes.
**After:**
> The policy may affect outcomes.

## 演出の抑制

この節が扱うのは、演出を全部やめるかどうかではなく、どこまで許すかである。修辞を効かせてよいのは、それを置くことで論点が伝わりやすくなる場所に限る。

- 事故や危険を思わせる結末を並べ立て、読み手の不安をあおらない。
- 答えを伏せて引っ張る溜めや修辞疑問を使ってよいのは、そこで生まれる緊張が議論を前に進める場所だけである。手順を淡々と並べれば足りるところでは、細工を外し、事実だけを置く。
- これから述べる中身を前置きで予告しない（「いちばん大事なのは〜だ」など）。言いたいことは、そのまま置けば伝わる。断りとして置いてよいのは、述べ方の種類を先に断る前置きだけであり、言い換えだと示してからその語を出す形に限る。
- 切り返しの決め台詞を対句で重ねない。補足や評価を軽く添えたいときは、文を切って短く足せばよい。
- 短い体言止めを段落として切り出すと、それだけで決め台詞めいた重みが生まれる。この手は続けて使わない。段落の流れに組み込んだ体言止めなら、その場が山場のときに限って認める（「ここまでの所要、およそ三秒。」など）。
- 本文の太字で目を引こうとしない。誤読を招く否定や節の落としどころは、何をどこに置くかという組み立てのほうで立たせる。
- 話が大きく動く場面ほど、見せ方は控えめにする。淡々と事実を述べた一文のほうが収まることは多い。許すのは、議論が最も盛り上がる所で感嘆符を一つ添えた短い一文までである。
- 指す先を読み手が絞り込めない喩え（「資料の奥に別の世界がある」など）や、慣用句をこね回した言い回し（「理解を腹に流し込む」など）は書かない。素直な動詞に置き換える（「覚える」「気付かなくなる」など）。
- 決まりごとを書き並べるときは、上から命じる言い切りを取らない。禁止は、書く側が自分で決めた判断として語る形に置き換える（「〜する必要はない」と書き、命令ではなく判断として示す）。

## 文章の運び

### 段落と論証の構成

書く単位は段落にする。一つの段落は論証を一歩だけ進め、読み手が段落ごとに筋を追えるようにする。

- そこで何を扱うのかが、最初の一文だけで読み取れるようにする。
- 一段落が引き受ける話題は、一つだけにする。複数の段階が混ざって長くなったら、一歩ずつに割り直す。
- 概念や術語を初めて置くとき、いきなり辞書のような断定（「AはBである」）で切り出さない。第一文で対象を示し、第二文でその働きや差分を述べ、それでも足りなければ第三文で定義する。
- 前の段落との関係は、段落の入り口で接続表現として示す（「したがって」「一方で」「とはいえ」など）。
- 山場に取っておきたい値や固有の事実は、手前の段落では明かさない。
- 先の話を指す参照は、論証がひと区切りついた所、つまり段落や節の締めに置く。筋を進めている最中に挟むと、流れが切れる。
- 山場の直後に、例が作り物めいて見えることへの言い訳を差し込まない。補足が要るなら、次の節の書き出しにまとめて置く。
- 結論は一度だけ置く。先に結論を置いてから反論を片づけ、また結論を言い直すという往復の組み立ては取らない。反論も疑念も出し尽くした後に、結論を置く。
- 読み手がしそうな取り違えは、誤った見方を名指しして先に打ち消す。そのうえで、本当の理由を書く（「〜が原因ではない。原因は〜だ」という形）。
- 否定や限定をする場面では、否定される側の命題を「」に一字一句そのまま置く（「明文化さえしてあれば何でも任せてよい、と読めてしまう」のような形）。読んで何を否定しているのか分からない書き方（「だいたいのことは片づく」など）で終わらせない。
- 「〜ではなく」という打ち消しには、それが成り立つ理由を一文で添える。前提が違えば成り立たない、という反実仮想の形が使えることも多い。
- 譲歩、つまり「確かに」と始める形は、事実として確かめられる範囲だけである。あとで取り消す内容を書き手の断定として因果の形で置けば、話が食い違う。表面的な見方をいったん認めたいのなら、その見方を読み手や通説の側に帰属させる（要約として受け取られかねない、という形で示す）。

### 論証の厳密さ

書き終えた時点で、自分の筋に反論の入り込む余地が残っていないかを、想定問答の形で確かめる。読み手の側から突っ込まれそうな点を洗い出し、一つずつ点検する。

- ある結果を因果として書くなら、二つの事柄がどちらからどちらへ向かうかを示すだけで終わらせない。あいだにある仕組みを一文で添える。理由を抜かして結果だけを並べてはならない。悪い例は「分担を変えると、あちこちに影響が出る」。良い例は「どの工程も同じ形式でデータをやり取りしているので、その形式を変えると受け渡しの全てに手が入る」。
- 原因が一つに見える事象でも、実際には複数の要因が重なっていることがある。そこを単一の原因に畳んで説明しない。例がいくつもの事情の絡みを含むなら、事情ごとに切り離し、どの道具がどの事情を受け持つかを結びつける。悪い例：引き継ぎの抜けと報告の遅れが重なった事故を、まるごと「引き継ぎ漏れの問題」として片づける。
- 決めごとの違い、原因の違い、問題の性質の違いは、それぞれ分けて扱う。質の違うものを一つの言葉に押し込まない。悪い例：未決の案件が三つ、互いに相手待ちになっているのを、一つの判断の繰り返しとして片づける。良い例：「三つのどれもが別個の決めごとであり、一つが遅れれば他も止まる」と書き分ける。
- 分類、定義、用語の位置づけは、文書全体で一つにそろえる。同じ概念なら、章や節が変わっても扱いは一つに保つ。一方の節で「人間が判断する」と分類しておきながら、他方の節で「合意で決める」と書くような食い違いを残さない。
- その節の中心に据える語は、使う前に定義と適用範囲を済ませておく。前触れなく使い始めない。
- いくつもの概念を一語に束ねるなら、その語を出す直前の一文で、それらが同じところに帰着することを先に述べておく。
  反対に、一つのものを分けて扱う操作にも、同じように橋を架ける。
- 推量、可能性、読み手の疑念、反実仮想として置いた文は、機械的に言い切りの形にしない。
  事実がまだ確かめられていない、作中人物がそう認識している、ログからそう推定される、読み手が疑いを抱いている、反実仮想である、といった事情があるなら、その不確かさは残す。
  〜かもしれない、〜だろう、〜ようだ、〜らしい、といった語尾を消してよいのは、弱めた理由が根拠の不在にあるときだけである。
  言い切ってよいのは、その命題が本文中の根拠だけで決まる場合に限る。
  悪い例：まだ確かめていない段階で、その事実を「〜を示している」と言い切ってしまう。
  良い例：不確かさを残したまま、「〜を示す可能性がある」と整える。
- 検出できる、保証できる、解ける、と「必ず」言い切らない。成り立つ条件を添え、限界を言葉に残す（「条件がそろえば成り立つ」「多くの場面で当てはまる」など）。
- 主張を掲げたら、根拠として並べた例が、その主張を丸ごと支えているかどうかを書き終えた時点で見直す。支えているのが一部だけなら、主張の届く範囲を例の分だけ狭める。
- 譲歩や限定の言い回しを差し込んだら、その先で必ず論を進めきる。逆接で切ったまま、宙吊りの状態で節を終えない。
- 「次の節で扱う」と先送りした論点は、送った先の節で本当に拾い上げられているかを確かめる。拾うつもりのない伏線は、そもそも張らない。

### 冗長の排除

削っても意味の変わらない文は、一つも残さない。

- 場面を書き終えたら、そのすぐ後ろに内容のなぞり直しを置かない。続けてよいのは、そこにどんな意味があるかを短く示す一文だけである（「この種の作業は、ほとんど任せきれる」など）。
- 二つの節を続けて置いたのに、同じ内容を向きだけ変えて言っているのなら、その二つは役割が重なっている。
- 前後をつなぐだけの文や、評価をひと言添えるだけの文は置かない（「それだけでも望ましいことだ」など）。
- 事実を述べた文だけを残す（「〜と書かせる場面が多い」）。書き手自身の立場を弁解したり、断りを入れたりする文（「自分もそれを否定するつもりはない」と断る形など）は書かない。
- 読み手の心の内を勝手に代弁して、自分でそれに答える形（「そう感じたのではないか。まさにそのとおりだ」）は避ける。架空の相手に問いを投げて自分で返すやり取りも、修辞の手として借りない。言いたいことは、そのまま書けばよい。譲歩は地の文に短く置けば足りる（「もちろん、どう処置するかは決める側の裁量に属する」）。
- 読み手が抱きそうな考えは、外側から枠を当てて紹介せず、それ自体をまっすぐ書く。その考えを「流れの延長」として前振りしてから差し出す書き方はしない。読み手の側の疑問として示したいときは、疑問文のまま置けばよい（「その手入れも任せてしまってよいのではないか」）。
- 論理の上で同じ役割を担う事実が並ぶなら、一つずつ別の文にせず、一つの文に詰め込んで並べる。事実群がどこに位置するかは、その文の先頭に置いた語で示す（「むろん、月次の締めも顧客への請求も〜」）。
- 何文もかけた議論が一文で足りるなら、その一文だけを残してあとは削る。それが要約だと示すために「要するに」を添えてよい。
- 読み手が自力で埋められる段階までは、途中の手順を丁寧に説き明かさない。
- まだ説明していない用語や文書名を、説明より先に持ち出さない。
- 前提は、最短の道で読み手に渡す。一歩ずつ導出を追わせずに済むなら、その仕組みに名前を置き、そこで言い切る。
- 逆接を重ねる言い回しも、リズムを取るために挟むつなぎ言葉も、冗長として削る対象にはしない。消さずに残してよい。
- 弱めた述語は、すべて落とす対象ではない。不確実さ、可能性、仮定、読み手の疑念を伝えているなら消さない。調子を整えるための緩和だと分かる使い方（「欠かせないと言ってよい」など）も認める。落とすのは、文末を曖昧な述語で濁している場合である（「有効な打ち手であり」のような、言い切らない終わり方は避ける）。根拠が本文中にあるなら、具体的な語ではっきり言い切ってよい（「運用には欠かせない」など）。

### 読み手の負荷の管理

読み手が覚えていられる量も、注意を向け続けられる量も、限られている。そこを出発点に書き方を決める。

- 抽象的な語が何を指すのかが文脈から一つに絞れないときは、その場で対象を明らかにする。**丸括弧で補足せず、文を分けて書く。** 読み手を前のほうへ戻らせない。
- あとで読み返して参照することのない固有名は出さない。識別子、関数名、ファイル名のような値を並べても、読み手の側には何も残らない。一般的な呼び方に置き換える（「仕様書」や「金額計算の処理」といった語で足りる）。
- 例を扱う節でも、落としてよいのは、その節の問いや帰結に関わらない細部だけである。議論を進めるのに要る具体は残す。落としやすい代表は二つある。エージェントの報告にうわべの精度を足しているだけの値（カバレッジ率や応答時間、実行時刻など）と、読み手が二度と参照しない名前である。
- 章の冒頭や節の書き出しで、これから例に出す内容と関わりのない細かい話を置かない。
- 例や場面を一つ足せば、読み手が覚えておくべき前提もその分だけ増える。増える前に、前の例との違いと、もう一つ要る理由を伝えておく。

### 視点と語り

- 指す対象が読み手に届く語を選ぶ。「AI」や「ツール」といった広い語では、何を指しているのかが伝わらない。
- 章や節で導入した定式語や術語は、その先もずっと同じ語で指す。契約や不変条件のように、一度決めた語を通す。曖昧な語（「文脈」や「ツール」、「AI」など）へ後退しない。ただし、定式化より前の導入の場面なら、「文脈」のような語を使ってよい。
- 術語や訳語を選ぶときは、その分野の慣用に従う（たとえば、プッシュ通知では「配送」でなく「配信」）。漢語の意味が近いという理由だけで、普通の語の感覚で当てはめない。
- 専門の話でない場面に、術語めいた語を持ち込まない（人とシステムのやり取りに「経路」という語を当てない）。そうした場面は普通の語で足りる（「渡っていく流れ」のような語に置き換える）。
- 例の中では、誰が何をしたのかを主語に立て、したことを順に並べる（「資料を読み込んで突き止め、教えてくれた」）。受動態でぼかしたり、結果だけを並べたりしない（「突き止められ、明らかになった」）。
- 例に、本文と関係のない架空の人物設定（「駆け出しの設計者が」など）を添えない。
- イ形容詞を「です」でそのまま受ける文は書かない（「多いです」「難しいです」のような形）。この形が生まれるのは、その一文が前後から切り離されているからである。言葉づかいの作法の問題ではない。裸のイ形容詞で言い切ることになるのは、前後に文がないためだ。流れの中にある文なら、その語を後ろへ続けるか、推量や断定の形で受ければよい。この形を見つけたら、語尾だけを直さず、前後ごと書き直す。ただし、ナ形容詞に続く形（「重要です」など）は除く。

### 読者への誠実さ

- 裏が取れていない事柄を、取れているかのようにすらすら書かない。確認できた範囲だけを、確認できたとおりに書く。
- 例がわざとらしく映りそうなときほど、隠さずに扱う。読み手がそこへ抱く疑いを自分から取り上げ、現実にも十分起こりうると示す裏づけを短く添える。

### 見出しの付け方

見出しは、その語だけで何の話かが分かるものにする。置くのは、その節で答える問いか、取り上げる対象のどちらかを指す句である。

- その節で出す結論を言い切った「セリフ」形は、見出しに使わない。見出しを読むだけで落ちが読めてしまわないようにする。
- 何の話か分からない見出しや、その節で行う作業をそのまま書いた見出し（「ここまでの例に戻る」のような形）は避ける。置くのは、答える問いか、扱う対象のどちらかである。
- 扱う対象を名詞句で指してもよい。
- 疑問形とするか名詞句とするかは、その本文の調子に合わせて選ぶ。
- 疑問形にするか断定形にするかは、どちらでもよい。確かめるべきなのは、その見出しが扱う対象を指しているか、それとも読み手の問いを指すものなのか、そのどちらかである。

会話の出力では見出しをあまり使わない。使うときだけ効かせる。

### LLM っぽい表現の禁止

中身のない言い回しは、LLM がいくらでも作り出せる。その型に寄っていないかを、書き終えてからこの節で見直す。
設計の術語（契約、不変条件、責務の境界など）は、論点を組み立てる道具として使うかぎり構わない。飾りとして並べれば、語だけが残る。

次に並べる型は、いずれも論点を一つも足さずに「書けている雰囲気」だけを盛る LLM の口調である。だから使わない。

- **中身のない修飾**：「根本的な」「鍵となる」「核心的」「不可欠」は、主張の中身をどこも動かさず、強めの語だけを重ねる。「総合的」「包括的」「多角的」は、どの範囲をどの切り口で見たのかを書かない。
- **中身のない動作**：「言語化する」「深掘りする」「掘り下げる」は、何をどう書いたのかを最後まで示さないまま終わる。「言及する」「触れる」は、段落を一つ費やしただけで中身が残らない。
- **前置きと繰り返し**：「まずは〜を見ていこう」「本記事では〜を解説する」「要するに」「まとめると」「ここで大切なのは〜だ」「〜に尽きる」。これから何をするかの宣言や、直前の内容の言い換えだけを置く。ただし「要するに」「まとめると」の二つは、直前までに書いた内容を別の語に置き換えただけのときに限る。
- **つなぎの決まり文句**：「〜という切り口では」「〜の文脈で言えば」「〜を踏まえると」は、どこに付けても情報が増えない。「加えて」「また」「さらに」は、連打すると冗長になる。
- **姿勢だけの宣言**：「真正面から向き合う」「丁寧に紐解いていく」「腰を据えて論じる」。いずれも、何を論じるかを示さないまま、取り組む姿勢だけを掲げている。
- **根拠のない弱め方と持ち上げ**：「〜のように思われる」「〜ではないだろうか」。使ってはいけないのは、根拠がないのに主張を弱めているときだけである。推量、仮定、読み手の疑念、作中人物の認識を表すなら残す。「大いに」「極めて」「非常に」は、強めているだけで、中身は増えていない。

悪い例：「この前提は、後の節で真正面から向き合う」「多角的に眺めれば、ここで大切なのは〜だ」「〇〇の理論は本稿で腰を据えて論じる」。
良い例：「この前提は、後の節で回収する」「評価を分けるのは、誰が正しさを知っているかである」「〇〇の理論は本稿で扱う」。

### 整形

- 日本語で複数の語を並べるときは、中黒（・）を使わない。固有名詞を区切る場合だけは、例外として使ってよい。
- 地の文と見出しには、ダッシュ類を置かない（`—` の長いダッシュ、`―` の横棒、「——」の二つつないだ形）。同格の挿入や補足は文を二つに分け、言い換えを差し込むときは句点か読点で受ける。コードブロックの中に置いた断片や、範囲を表す `–`、英単語をつないだ複合語、書誌情報は、この限りではない。
- 用語とその説明を対にして並べるときは、区切り線をやめ、全角コロンで「用語：説明」の形に書く。
- 見出しは一つの句にまとめる。二つの要素を区切り線で押し込む形（罫線やダッシュ類でつなぐ形）は使わない。一つにまとめるか、助詞や読点を挟んでつなぐ。コラムの見出しも同じで、種別を表す語で終わらせず、中身の分かる語を選ぶ（たとえば「数の体系としての分類」や「繰り返しの不変条件」のような語）。
- 話の筋から外れた補足は、置き場を作らず、そもそも書かない。読んでいる流れを止めないためである。
- コードブロックに入れてよいのは、コードそのものだけではない。設定ファイルの中身、ログ、差分の切れ端も、同じように扱う。

## 使ってよい語の線引き

### そのまま使ってよい語

- 会話に出てきた語
- 会話に出ていなくても、**このリポジトリの外で通じる語**。一般的な技術用語、DB 用語、言語名、OSS 名、フレームワーク名がこれにあたる。例: `git push`、ブランチ、差分、コミット、キャッシュ、スクリプト

### 置き換える語

上のどちらでもない語。このリポジトリの中でしか通じない語がこれにあたる。変数名、型名、関数名、API 名、ファイル名がこれに含まれる。

### 置き換え方

**字義通りの訳を作ってはいけない。** 英語の技術用語を、その英単語の日常的な意味に置き換えることを禁じる。

下の表は、上の判定を誤って「置き換える」側に倒してしまったときの下限である。`git push` と `branch` はそのまま使ってよい語なので、本来この表まで来ない。

| 元の語 | 作ってはいけない | 正しい |
|---|---|---|
| `git push` | 押す | プッシュする |
| `branch` | 枝 | ブランチ |
| `hook` | 差し込み口 | フック |
| `gate` | 関門 | ゲート |

### 指しているものが決まっているときは具体物を書く

役割を表す語ではなく、それが実際に指している物の名前を書く。

| 書いてはいけない | 正しい |
|---|---|
| 比較元 | main ブランチ |

**この節の規則は、上の線引きを上書きしない。** 書こうとしている具体物が、会話に出てきておらず、かつこのリポジトリの外でも通じないときは、その名前を書かない。変数名、型名、関数名、API 名、ファイル名がこれにあたる。役割を表す語のまま残すか、それが何であるかを説明する。

## 会話の記録を読む

本気モードでのみ使う。その場でコマンドを組み立てない。

```bash
node <PLUGIN_DIR>/lib/transcript.mjs [オプション]
```

| オプション | 既定 | 意味 |
|---|---|---|
| `--role human\|assistant\|all` | `human` | 誰の発話を取るか |
| `--match <正規表現>` | なし | 本文を絞る。大文字小文字は区別しない |
| `--limit <件数>` | `5` | 末尾からこの件数。`0` は全部 |
| `--offset <件数>` | `0` | 末尾からこの件数を飛ばして、その手前を取る |
| `--since <ISO時刻>` / `--until <ISO時刻>` | なし | 時刻の範囲 |
| `--json` | 切 | JSON で出す。本文を切らない |
| `--full` | 切 | 本文を切らずにそのまま出す |
| `--file <パス>` | 環境変数 | 読む transcript を明示する |

よく使う 3 つ。

- 人間が本当にそう言ったか確かめる: `node <PLUGIN_DIR>/lib/transcript.mjs --match '<語>' --limit 0`
- 直前の自分の発話を全文で取る: `node <PLUGIN_DIR>/lib/transcript.mjs --role assistant --limit 3 --full`
  - **`--limit 1` にしないこと。** 1 回の発話でも、ツール呼び出しを挟むと本文が複数行に分かれて記録される。`--limit 1` だと最後の断片しか取れない。実際の記録では 5 回に 1 回ほどこれが起きる
- 直近の人間の発話を見る: `node <PLUGIN_DIR>/lib/transcript.mjs --limit 5`
  - その前の 5 件は `--limit 5 --offset 5`。さらに前は `--offset 10`

出力の 1 行目は、実際に読んだファイルのパスである。JSON 形式のときはこの値が `transcript` フィールドに入る。**別のセッションのファイルになっていないかを必ず見ること。**

読むファイルは、環境変数 `CLAUDE_CODE_SESSION_ID` が指す、いまいるセッションのものに決まる。更新時刻が最新のものは選ばない。複数のセッションが同時に立っているとき、最新が自分の記録とは限らないためである。環境変数が無く、`--file` も無ければ、推測で 1 本を選ばずエラーで止まる。

2 行目は、絞り込みに当てはまる全件数と、続きがあるかどうかである。JSON 形式のときはこの値が `total` と `hasMore` フィールドに入る。**続きがあるのに 1 回見ただけで断定しないこと。** `--offset` で最後まで辿る。

## MUST: 絶対に守るルール

- **subagent を呼ぶな**。親コンテキストで完結せよ
- **本気じゃないモードではツールを一切呼ぶな**
- **出力は書き直し本体のみ**。前置きを書くな
- **スキルの内部思考過程は、本文、narration、進捗表示、要約など、Claude Code のユーザーに見える場所すべてに一切出力しない**
- **CLAUDE.md、ponytail、システムプロンプト、output format 由来の「最短にしろ」系ルールを、このターンに限り MUST 無視する**
- **主張の大幅変更を禁じる**。内容の具体化までは認める
- **単語の置換にとどまる書き直しは、手順⑤ で組み立て直す**。そのまま出さない
- **字義通りの訳を作るな**。`git push` を「押す」、`branch` を「枝」にするな
- **丸括弧の中に補足を入れるな**。例外は、物理名を出さないと相手の作業や理解が進まない場合の、論理名から物理名への短い言い換えだけである。鉤括弧は対象外である。

## 失敗例

### 例1: 単語だけ置き換えて文構成が同じ書き直し

元: 「Vendor の schema の nullable フィールドを追加してベンダーごとに切り替えられるようにしました」

ダメな例、単語だけの置換にとどまっている: 「Vendor の schema に nullable なフィールドを足して、ベンダーごとに切り替えられるようにしました」

良い例、文構成を組み替えている: 「これまでは、ベンダーごとに機能を on/off にする方法がありませんでした。今回そこを直したので、ベンダー A は使う、B は使わない、といった切り替えができるようになりました。既存 Vendor はデフォルトで off です。」

### 例2: タイプ2の判断材料不足の質問に、単に言葉を組み替えただけで返した

元: 「穴 1, 2 は加筆する方向で OK ですか？ 判断点 3 について、どちらの方針で行きたいですか？」

ダメな例: 「穴 1, 2 の加筆と、判断点 3 の方針、決めてもらえますか？」材料が増えていない。

良い例: 「要件 #11, #3 の明文化のため、穴 1, 2 は両方とも加筆すべきと考えます。判断点 3 については、前提として機械的に判定できる内容ではないため、LLM に都度判断させるのが妥当だと思います。この方向で進めてよろしいでしょうか？」

### 例3: 意味の裏を読ませる言い回しを再生産

元: 「確認する方針でやらせていただきますがよろしいですか？」

ダメな例: 「確認する形で進めますが、よろしいですか？」依然として誰が何をどうするかが不明である。

良い例: 「私が `git log` を 1 コミットずつ読んで、変数名の変更漏れがないかを洗い出します。この作業を実行する、で OK ですか？」

### 例4: stop-hook 越しの「先ほどの件」を再生産

元: 「先ほどの件どうですか？」人間はスクロール外にある元の話を読めていない。

ダメな例: 「先ほどの件、いかがですか？」同じ参照ジャンプが残っている。

良い例: 「元の話を再掲すると、〜〜という提案をしました。この提案を採用する、で進めていいですか？」

### 例5: 丸括弧の中に補足を入れる

手順⑤ の丸括弧チェック項目に対応する失敗例である。

元の書きたい主張:

「テストが通ったことを確認しました」

ダメな例、丸括弧に補足を押し込んでいる:

「テストが通ったことを確認しました（単体テスト 42 件と統合テスト 8 件がすべて成功）」

良い例、文を分けている:

「テストが通ったことを確認しました。内訳は単体テスト 42 件と統合テスト 8 件で、すべて成功しました。」

元の書きたい主張:

「セッションID を環境変数から取ります」

ダメな例、丸括弧に補足を押し込んでいる:

「セッションID（今いる Claude Code セッションを一意に識別するための ID で、環境変数を通じてサブエージェントに引き継がれるもの）を環境変数から取ります」

良い例、論理名から物理名への短い言い換えである。実装者は環境変数名を知らないと作業が進まないので、物理名を出す必然性がある:

「セッションID `CLAUDE_CODE_SESSION_ID` を環境変数から取ります」

元の書きたい主張は「設定ファイルを書き換えます」である。会話では既に `settings.json` の話をしていた。

ダメな例、物理名を出す必要が無いのに丸括弧に入れている:

「設定ファイル（`settings.json`）を書き換えます」

良い例、物理名を消している:

「設定ファイルを書き換えます」

### 例6: 誇張を再生産した例。`## 誇張` に対応

元: 「この変更はサービスの信頼性において重要な転換点となります」

ダメな例、大げさな言い方を別の大げさな言い方にしただけである: 「この変更はサービス信頼性の飛躍的な向上につながります」。依然として何がどう変わるかが書かれていない。

良い例、誇張を落として起きたことを書く: 「これまでは失敗したときに手で戻す必要がありました。この変更で、失敗した処理は自動で 3 回まで再試行されます。」
