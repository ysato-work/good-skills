# Phase 6: Apply — ケースへの反映

**スキップは絶対に禁止。** `<workdir>/passed.json` に入っている指摘は全件反映する。

## 反映しない言い訳にならないもの

以下はどれも、反映を飛ばす理由にならない。

- 「偽陽性だと思う」
- 「すでに別のケースで対応済みに見える」
- 「直すとケースが増えてリスクが高い」
- 「機械的な書き換えに落とせない」
- 「確信度が閾値ぎりぎりだった」
- 「同じような指摘をさっき反映した」

**偽陽性かどうかを自分で判定しない。** 足切りは Phase 5 が済ませてある。ここまで
残ったものは反映する対象である。

## やること

`passed.json` を先頭から最後まで走査し、1 件ずつ `<workdir>/cases.json` を直す。

| axis | 典型的な直し方 |
|---|---|
| `feasibility` | 手段を Tier 1 / Tier 2 の範囲に書き直す。無理なら `out_of_scope` にして理由を書く |
| `validity` | `steps` と `expected` を、実行すれば合否が決まる形に書き直す |
| `coverage` | ケースを足す。`req_ids` を 1 件以上付ける |
| `box` | `box` と `technique` を直す。必要なら `level` も直す |
| `out-of-scope` | Tier 2 でできるものなら `status` を `todo` に戻し、`out_of_scope_reason` を空にする |

## 反映した件数を記録する

`<workdir>/metadata-iter-<iter>.json` に書く。Phase 7 が読む。

`max_iter` は `kiai-sp/lib/spec-testing/constants.mjs` の `REVIEW_MAX_ROUNDS` を
そのまま書く。ここにも数値を直書きしない。

```json
{
  "iter": 1,
  "max_iter": 2,
  "findings_total": 12,
  "passed": 7,
  "applied": 7,
  "skipped": 0,
  "skipped_reasons": []
}
```

（上の `2` は `REVIEW_MAX_ROUNDS` の初期値を示す例であって、直書きしてよいという
意味ではない。）

`skipped` が 0 でないなら、その理由を `skipped_reasons` に必ず残す。ログに残らない
スキップを作らない。
