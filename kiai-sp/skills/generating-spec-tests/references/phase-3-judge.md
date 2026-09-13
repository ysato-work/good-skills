# Phase 3: Judge — 同じ指摘のグループ化

## 3.1 プールを作る

```bash
node -e '
import("<skill_dir>/lib/pool-findings.mjs").then(async (m) => {
  const { writeFileSync } = await import("node:fs");
  const labels = <Phase 1 が返した labels の JSON 配列>;
  const pooled = m.poolFindings(m.readResults("<workdir>", labels));
  writeFileSync("<workdir>/pool.json", JSON.stringify(pooled, null, 2));
  console.log(pooled.length);
});
'
```

プールが 0 件なら judge を起動せず、`<workdir>/judge.json` に
`{"agent_total": <レビュア数>, "groups": []}` を書いて 3.3 へ進む。**Phase を飛ばさない。**

## 3.2 judge を 1 体だけ起動する

`subagent_type: kiai-sp:generating-spec-tests:judge`

```
pool_path: <workdir>/pool.json
output_path: <workdir>/judge.json
schema_path: <skill_dir>/lib/judge-schema.json
```

**judge は 1 体だけ。** 複数立てるとグループ化が食い違う。

失敗したら最大 1 回だけ再起動する。それでも失敗したらエラーで停止する。

## 3.3 ID を採番する

```bash
node -e '
import("<skill_dir>/lib/pool-findings.mjs").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  const workdir = "<workdir>";
  const pooled = JSON.parse(readFileSync(workdir + "/pool.json", "utf8"));
  const judge = JSON.parse(readFileSync(workdir + "/judge.json", "utf8"));
  const flat = m.flattenFindings(pooled, judge);
  m.writeFlat(workdir, flat);
  console.log(flat.length);
});
'
```

throw したらエラーで停止する。**空配列に潰して先に進まない。**

`groups` が空配列であること自体は正常である。全レビュアが何も指摘しなかった姿で、
Phase 7 でループが終わる。
