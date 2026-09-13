# Phase 8: 台帳の書き出し

`kiai-sp/lib/spec-testing/DATA-CONTRACT.md` を読んでから進む。

```bash
node -e '
import("<skill_dir>/lib/build-ledger.mjs").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  const workdir = "<workdir>";
  const out = m.buildLedger("<artifact_dir>", {
    requirements: JSON.parse(readFileSync(workdir + "/requirements.json", "utf8")),
    cases: JSON.parse(readFileSync(workdir + "/cases.json", "utf8")),
  });
  console.log(JSON.stringify(out));
});
'
```

`case_id` はここで初めて確定する。`level` 順に並べ切ってから採番される。

throw したらエラーで停止する。台帳の契約違反も、要件が紐づかないケースも、ここで
落ちる。書いてしまってから実施フェーズで気づくより安い。

## 生成フェーズの検査

```bash
node kiai-sp/lib/spec-testing/check-progress.mjs --dir <artifact_dir> --phase generation
```

| 終了コード | 意味 |
|---|---|
| `0` | `testable` が `yes` の要件がすべて被覆されている。完了 |
| `1` | 被覆漏れがある。Phase 0.3 に戻ってケースを足す |
| `2` | 検査できなかった。エラーで停止する |

`1` で戻るのは 1 回だけにする。2 回目も `1` なら、被覆できない要件の ID を挙げて
エラーで停止する。`testable` の判定が誤っている可能性が高い。

## ユーザーへの報告

- 要件の件数と、うち `testable` が `no` の件数
- テストケースの件数を `level` ごとに
- `out_of_scope` の件数と理由の内訳
- レビュー合議の周回数、採用した指摘の件数、落とした指摘の件数
- 台帳のパス
