# Phase 7: Loop — 続けるか決める

```bash
node <skill_dir>/lib/should-continue.mjs <workdir>/metadata-iter-<iter>.json
```

| decision | 次にやること |
|---|---|
| `continue` | `<iter>` を 1 増やして Phase 1 に戻る |
| `stop` | Phase 8 へ進む |

## 終了条件

決定論式だけを使う。

- 継続: `applied >= 1` かつ `iter < max_iter`
- 終了: `applied == 0` または `iter >= max_iter`

`max_iter` は `kiai-sp/lib/spec-testing/constants.mjs` の `REVIEW_MAX_ROUNDS` を使う。
**このフェーズにも Phase 6 の `metadata-iter-<iter>.json` にも `2` を直書きしない。**
`constants.mjs` はここで値を変えれば S3 のループがそのまま変わることを前提にした
「1 箇所だけ定義する」規約になっている。直書きすると、値を調整したときにここだけ
古い値のまま取り残される。初期値は 2（骨格の既定 10 より少ない。テストケースの
レビューは 2 周で頭打ちになるという判断）。

**主観で終了を判断しない。** 「品質が上がった」「これ以上直すところが無い」は
終了条件ではない。スクリプトの返した `decision` にそのまま従う。
