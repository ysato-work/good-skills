# Phase 1: Bundle — チャンクへ割る

```bash
node -e '
import("<skill_dir>/lib/chunk-cases.mjs").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  const workdir = "<workdir>";
  const out = m.writeBundle(workdir, {
    requirements: JSON.parse(readFileSync(workdir + "/requirements.json", "utf8")),
    cases: JSON.parse(readFileSync(workdir + "/cases.json", "utf8")),
  });
  console.log(JSON.stringify(out));
});
'
```

1 体のレビュアが見るのは 20 件。件数はコード側の `CHUNK_SIZE` が持つ。ここで数え直さない。

出力の `labels` が Phase 2 で起動するレビュアの一覧になる。`chunk-001` … と `whole`。

## 2 周目以降

Phase 6 でケースを直したあと、`<workdir>/cases.json` を上書きしてから Phase 1 を
やり直す。チャンクの切れ目が変わってよい。
