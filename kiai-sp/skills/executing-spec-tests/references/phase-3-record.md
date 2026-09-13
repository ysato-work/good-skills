# Phase 3: 記録 — 台帳への書き戻し

```bash
node -e '
import("<skill_dir>/lib/apply-result.mjs").then((m) => {
  console.log(JSON.stringify(m.applyResult(
    "<artifact_dir>",
    "<case_id>",
    { status: "<子が返した status>", testCodePath: "<子が返した test_code_path>" },
    {},
  )));
});
'
```

Phase 2 で `exhaust` だった場合は、子を起動せずに `status: "error"` で呼ぶ。

## 返ってくるもの

| フィールド | 意味 |
|---|---|
| `status` | 台帳に書かれた最終的な状態 |
| `attempts` | 増えたあとの試行回数 |
| `retrying` | `true` なら `todo` に戻したので、また回ってくる |
| `downgraded` | `true` なら証跡が無くて落とした |
| `reason` | 落とした理由 |

`downgraded` が `true` だったら、子が証跡を書かなかったということである。次に同じ
ケースが回ってきたときの `case_runner` への指示に「証跡を必ず書くこと」を明示する。

`assertResultStatus` が throw したらエラーで停止する。`out_of_scope` を書こうと
したということなので、そのまま進めない。

## 親はログを開かない

子が書いた `.log` も `commands.md` も **親は読まない。** パスだけを扱う。

親が生のテスト出力を読むと、数十件消化したところでコンテキストが尽き、残りが
消化されないまま終わる。実際に起きる事象なので、構造として入らないようにする。

ユーザーに出すのは、子の `summary` を 1 行に切り詰めたものと、`applyResult` が
返した `status` だけ。
