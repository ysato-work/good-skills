# Phase 4: Score — 確信度の採点

## 4.1 バッチに割る

```bash
node <skill_dir>/lib/chunk-confidence-batches.mjs <workdir>
```

`<workdir>/confidence-batches/batch-NNN.json` が並ぶ。0 件なら Phase 5 へ進む。

## 4.2 scorer をバッチ数だけ並列起動する

`subagent_type: kiai-sp:generating-spec-tests:confidence-scorer`

**1 レスポンス内で並列起動する。**

```
batch_path: <workdir>/confidence-batches/batch-NNN.json
schema_path: <skill_dir>/lib/confidence-schema.json
```

## 4.3 やり直し

Phase 5 の検査が「再採点せよ」を返したら、未採点として挙がった ID を含むバッチだけ
起動し直してから Phase 5 に戻る。

**やり直しの回数はコード側が数える。** 親が数えない。`--attempt` に渡す値を 1 ずつ
増やすだけにする。
