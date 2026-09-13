# Phase 0: 準備

## 事前確認

1. `node --version` が通ること
2. `kiai-sp/agents/executing-spec-tests/case-runner.md` があること
3. `<artifact_dir>/cases.tsv` と `requirements.tsv` があること

どれか欠けたらエラーで停止する。

`kiai-sp/lib/spec-testing/DATA-CONTRACT.md` を読む。

## 既存のTier 2資源を確認する

前回のセッションが中断した場合、立てたコンテナ・ボリューム・ネットワークが残っている
可能性がある。Phase 1 で新しい環境を立てる前に、`spec-testing-` で始まる既存資源が
無いかを確認する。

```bash
node -e '
import("kiai-sp/lib/spec-testing/env-snapshot.mjs").then((m) => {
  const env = m.collectEnv();
  const prefixed = (list) => list.filter((n) => n.startsWith("spec-testing-"));
  console.log(JSON.stringify({
    available: env.available,
    containers: prefixed(env.containers),
    volumes: prefixed(env.volumes),
    networks: prefixed(env.networks),
  }));
});
'
```

既存資源が1件でもあれば、**黙って再利用も破棄もしない。** ユーザーに報告し、
「前回のセッションの残留物として再利用してよいか、破棄してから新しく立てるか」を
確認してから進める。無人実行で判断がつかない場合は、安全側として破棄してから
新しく立てる（`spec-testing-` で始まる名前だけを対象にする）。

既存資源が無ければ（`containers`・`volumes`・`networks` がすべて空、または
`available: false`）、何もせずそのまま次の節に進む。

## 台帳の状態を見る

```bash
node -e '
Promise.all([
  import("<skill_dir>/lib/next-case.mjs"),
  import("<skill_dir>/lib/level-plan.mjs"),
  import("kiai-sp/lib/spec-testing/ledger.mjs"),
  import("kiai-sp/lib/spec-testing/paths.mjs"),
]).then(([next, plan, ledger, paths]) => {
  const rows = ledger.readCases(paths.casesPath("<artifact_dir>"));
  console.log(next.progressLine(rows));
  console.log(JSON.stringify(plan.levelRuns(rows), null, 2));
});
'
```

中断からの再開なら、消化済みの行はそのまま残っている。`todo` に戻っている行だけが
再実行される。**済んだ行を消化し直さない。**

## 目標条件を立てる（対話実行のときだけ）

ターン終了フックとは別に、目標条件でも継続させる。二重に効かせることで、片方が
想定外の挙動をしてももう片方が残る。

条件は「`<artifact_dir>/cases.tsv` の todo が 0 件になっていること」。

CI 実行では目標条件が使えないので設定しない。フックだけが頼りになる。

ゲートの詳しい挙動は `kiai-sp/lib/spec-testing/COMPLETION-GATE.md` にある。
詰まって降りた場合は `<artifact_dir>/stop-report.json` が残る。

## ユーザーに伝えること

進捗の 1 行と、レベルごとの件数だけ。台帳の中身を展開しない。
