# Phase 5: 後始末

## 1. 環境を落とす

立てたものを全部落とす。`spec-testing-` で始まる名前のものだけを対象にする。

## 2. 残っていないことを確認する

```bash
node -e '
import("kiai-sp/lib/spec-testing/env-snapshot.mjs").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  const before = JSON.parse(readFileSync("<artifact_dir>/../.env-before.json", "utf8"));
  console.log(JSON.stringify(m.verifyNoLeftovers(before, m.collectEnv(), {}), null, 2));
});
'
```

`ok` が `false` なら、立てた環境が残っているか、開発者の資源が変わっている。
**理由をユーザーに報告する。** 黙って進めない。

確認が終わったら `.env-before.json` を消す。成果物ではない。

## 3. 単体テストの収集対象を確認する

`integration` か `e2e` のテストコードを追加した場合だけ。追加していないなら飛ばす。

追加前に単体テスト実行コマンドの一覧を記録していなかった場合は、追加したファイルを
一時的に退避して取り直す。

```bash
node -e '
import("kiai-sp/lib/spec-testing/collection-diff.mjs").then((m) => {
  const before = m.snapshot(<退避中に取った出力>);
  const after = m.snapshot(m.runCollect("<単体テストの一覧取得コマンド>", { cwd: "<repo_root>" }).stdout);
  console.log(JSON.stringify(m.verifyNoNewCollection(before, after), null, 2));
});
'
```

`ok` が `false` なら、追加したテストが単体テストの収集対象に入っている。ディレクトリ
か命名規則を変えて取り直す。**この確認の実行コマンドと出力を証跡に残す。**

## 4. 報告

- 消化した件数と内訳（`pass` / `fail` / `error` / `out_of_scope`）
- `fail` の一覧。case_id とタイトルだけ。**ログを貼らない**
- `error` の一覧と、それぞれ何回試したか
- 追加したテストコードのパス
- 証跡のディレクトリ

`report.md` の作成は Phase 6 で行う。ここでは書かない。次は Phase 6（納品）に進む。
