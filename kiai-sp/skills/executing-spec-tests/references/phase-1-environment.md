# Phase 1: 環境 — レベルの切れ目で 1 回だけ立てる

```bash
node -e '
Promise.all([
  import("<skill_dir>/lib/level-plan.mjs"),
  import("kiai-sp/lib/spec-testing/ledger.mjs"),
  import("kiai-sp/lib/spec-testing/paths.mjs"),
]).then(([plan, ledger, paths]) => {
  const rows = ledger.readCases(paths.casesPath("<artifact_dir>"));
  const level = plan.currentLevel(rows);
  console.log(JSON.stringify({ level, needsEnvironment: level && plan.needsEnvironment(level) }));
});
'
```

| 結果 | やること |
|---|---|
| `level` が `null` | Phase 4 へ（消化するものが無い） |
| `needsEnvironment` が `false` | 何も立てずに Phase 2 へ |
| `needsEnvironment` が `true` かつ既に立っている | 何もせず Phase 2 へ |
| `needsEnvironment` が `true` かつ立っていない | 下の手順で立ててから Phase 2 へ |

## 立てるとき

`kiai-sp/lib/spec-testing/TIERS.md` を読んでから立てる。

- 名前は `spec-testing-` で始める。`docker compose` は `-p spec-testing-...` を付ける
- ホストポートを固定しない。`-p 127.0.0.1::<port>` か `-P` を使い、割り当てられた
  ポートを読む
- **立てる前に、立てる前の状態を記録しておく。** Phase 5 で突き合わせる

```bash
node -e '
import("kiai-sp/lib/spec-testing/env-snapshot.mjs").then(async (m) => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("<artifact_dir>/../.env-before.json", JSON.stringify(m.collectEnv()));
});
'
```

立て方は、リポジトリの記述か公式イメージの標準的な起動方法に根拠があるものだけ。
**推測で組み立てない。** 根拠が無いなら立てず、そのレベルのケースは `error` に
なる（`out_of_scope` にはしない。対象外の判定は生成時に済んでいる）。

立てたら、接続先を Phase 2 で子に渡す。

## レベルが変わったら

前のレベルの環境を落としてから、次を立てる。落とすのも `spec-testing-` で始まる
名前のものだけ。
