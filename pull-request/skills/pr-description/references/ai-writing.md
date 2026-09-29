# 読み手に届く日本語を書くための規範

## この規範の使い方

- この規範は語の検出ではなく、読み手の負担を見る。語の検出は `policy/slop.json` が既にやっている。ここに書いてある語を 1 つずつ探す作業ではない
- 展開部分は 21 バイト・最大 2 文という独自の型を持つ。`## 見た目` の「一文ごとに改行」を含め、規範のうちこの型と衝突するものは `<details>` の中身と行コメントにだけ適用する
- `## 語り口` の節は、語り口の判定役が名指しで読む。残りの節は読み手が構造を見るときに使う

## 語り口

### 演出の抑制

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

### 冗長の排除

削っても意味の変わらない文は、一つも残さない。

- 場面を書き終えたら、そのすぐ後ろに内容のなぞり直しを置かない。続けてよいのは、そこにどんな意味があるかを短く示す一文だけである（「この種の作業は、ほとんど任せきれる」など）。
- 一度書いた主張はそれで足りる。同じ中身を語を替えて二度目に書かない。
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

### 大げさに言う

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

### 言い方の癖

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

**§25 当たり障りのない前向きな結び**
**Problem:** AI writing often ends with vague optimism instead of the last useful fact.
**Before:**
> The future looks bright for the company. Exciting times lie ahead as they continue their journey toward excellence. This represents a major step in the right direction.
**After:**
> (Cut the paragraph. End on the last concrete fact instead of a send-off. If the source states real plans, use those.)

**§28 次の論点の予告**

**Phrases to watch:** Let's dive in, let's explore, let's break this down, here's what you need to know, now let's look at, without further ado, heads up, quick note, before I forget
**Problem:** AI writing often announces the next point instead of stating it. A casual phrase such as "one thing that bit me" can have the same problem. Remove the announcement, not just its formal tone.
**Before:**
> Let's dive into how caching works in Next.js. Here's what you need to know.
**After:**
> Next.js caches data at multiple layers, including request memoization, the data cache, and the router cache.
**Before (casual register):**
> One thing that bit me hard, so pay attention to this part: the webpack dev server doesn't send the CORS header by default.
**After:**
> The webpack dev server doesn't send the CORS header by default.

**§31 無理な決め台詞と断片的な演出**
**Problem:** AI writing often turns each sentence into a dramatic closing line. One short sentence can add emphasis. A row of short fragments usually feels forced.
**Before:**
> Then AlphaEvolve arrived. It had no preference for symmetry. No aesthetic prior. No nostalgia for human taste. The old rules were gone.
**After:**
> AlphaEvolve changed the search because it did not favor symmetry or human-looking designs. That made some of the older assumptions less useful.

**§34 誰も出していない反論への応答**

**Phrases to watch:** This isn't (mainly/really) about, I'm not saying/arguing/trying to, To be clear, Don't get me wrong, This is not to say, You could argue/frame this differently but, Some might say... but
**Problem:** AI writing may answer an objection that does not appear in the text. Watch for an unattributed statement about what the writer does not mean, especially when the topic appears nowhere else. A direct claim such as "the API is not thread-safe" is not this pattern.
**Before:**
> This isn't mainly about prompt length, and I'm not arguing that documentation doesn't matter. You could categorize the problem another way, but the issue is whether the agent can use the instruction when it acts.
**After:**
> The issue is whether the agent can use the instruction when it acts.

Remove only the unsupported defense. If it contains a real claim, state that claim directly. Keep an objection when the text names its source or answers it in full.

**§35 偽の代案の否定**

**Phrases to watch:** A tempting option/approach would be, One might be tempted to, An obvious approach would be, You might think... but, It would be easy to just, Some would suggest
**Problem:** AI writing may introduce an option that no reader would consider, reject it in a clause, and never mention it again. This often leaves an old drafting idea in the final text. Remove the fake option and state the real constraint directly.
**Before:**
> Session tokens are rotated every 24 hours. A tempting approach would be to rotate them by restarting the auth service on a cron job, but that would drop every active session. Rotation happens in place, and clients refresh transparently.
**After:**
> Session tokens are rotated every 24 hours, in place, and clients refresh transparently.

One rejected option may be valid. Several short, unrelated rejections are a stronger sign. Ask what new information each sentence adds. If it only records an earlier edit, rewrite the paragraph around its main point.

## 論証

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

### 出典と推測

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

## 読み手

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

## 見た目

### 整形

- 日本語で複数の語を並べるときは、中黒（・）を使わない。固有名詞を区切る場合だけは、例外として使ってよい。
- 地の文と見出しには、ダッシュ類を置かない（`—` の長いダッシュ、`―` の横棒、「——」の二つつないだ形）。同格の挿入や補足は文を二つに分け、言い換えを差し込むときは句点か読点で受ける。コードブロックの中に置いた断片や、範囲を表す `–`、英単語をつないだ複合語、書誌情報は、この限りではない。
- 用語とその説明を対にして並べるときは、区切り線をやめ、全角コロンで「用語：説明」の形に書く。
- 見出しは一つの句にまとめる。二つの要素を区切り線で押し込む形（罫線やダッシュ類でつなぐ形）は使わない。一つにまとめるか、助詞や読点を挟んでつなぐ。コラムの見出しも同じで、種別を表す語で終わらせず、中身の分かる語を選ぶ（たとえば「数の体系としての分類」や「繰り返しの不変条件」のような語）。
- 一文ごとに改行する。段落と段落の間には、空行を一つ置く。
- 論の本線から離れた補足は、本文から外して脚注へ回す（`[^メモ]` の形にする）。定式化の呼び名や用語の由来が、これにあたる。
- コードブロックに入れてよいのは、コードそのものだけではない。設定ファイルの中身、ログ、差分の切れ端も、同じように扱う。

### 範囲と並列

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

## 語彙

### 宣伝口調

**§4 宣伝口調**

**Words to watch:** boasts a, vibrant, rich (figurative), profound, enhancing its, showcasing, exemplifies, commitment to, natural beauty, nestled, in the heart of, groundbreaking (figurative), renowned, breathtaking, must-visit, stunning
**Problem:** AI writing often sounds like an advertisement, especially when it describes places, culture, products, or organizations.
**Before:**
> Nestled within the breathtaking region of Gonder in Ethiopia, Alamata Raya Kobo stands as a vibrant town with a rich cultural heritage and stunning natural beauty.
**After:**
> Alamata Raya Kobo is a town in the Gonder region of Ethiopia.

この語彙は `policy/slop.json` の『大げさな形容』に入っている

### AI の多用語

**§7 AI の多用語**

**High-frequency AI words:** Actually, additionally, align with, crucial, delve, emphasizing, enduring, enhance, fostering, garner, gate/gated/gating (figurative; preserve established technical usage), highlight (verb), interplay, intricate/intricacies, key (adjective), landscape (abstract noun), pivotal, quietly, showcase, tapestry (abstract noun), testament, underscore (verb), valuable, vibrant
**Problem:** AI writing uses these words much more often than most people do, especially in groups.
**Before:**
> Additionally, a distinctive feature of Somali cuisine is the incorporation of camel meat. An enduring testament to Italian colonial influence is the widespread adoption of pasta in the local culinary landscape, showcasing how these dishes have integrated into the traditional diet.
**After:**
> Somali cuisine also includes camel meat, which is considered a delicacy. Pasta dishes, introduced during Italian colonization, remain common, especially in the south.

この語彙の日本語版は `policy/slop.json` の『大げさな形容』と『空虚な動詞』に入っている
