# Phase 6: 納品

**分岐は無い。人間に尋ねない。** 下の順にそのまま実行する。

## 6.0 起点を確定する

**6.1 より前に、ここで一度だけ確定する。** Phase 6 に入った時点ではまだブランチを
切り替えていない（切り替えるのは 6.4）。ここで確定した値を 6.1 と 6.3 でそのまま
使い、以降で作り直さない。

```bash
node -e '
import("kiai-sp/lib/spec-testing/branch-plan.mjs").then((m) => {
  console.log(JSON.stringify(m.collectGit({ cwd: "<repo_root>" })));
});
'
```

出力の `branch` を `<base_branch>`、`remote` を `<remote>` とする。**どちらかが
空なら Phase 6 全体を停止する。** 投稿先が決まらない状態で成果物を作らない。

差分の範囲は、S3 の Phase 0.2 と同じ求め方をする（実行時点の分岐元を機械的に
求める。推測しない）。

```bash
git -C <repo_root> merge-base HEAD "$(git -C <repo_root> rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo origin/HEAD)"
```

得られたコミットを `<merge_base>` とし、`<diff_range>` は `<merge_base>..HEAD` と
する。

以降の 6.1 と 6.3 は、ここで求めた `<base_branch>` / `<remote>` / `<diff_range>` を
使う。**それぞれの節で改めて `collectGit()` を呼び直さない。** 呼び直すと、その
時点でブランチが切り替わっていた場合に違う値を拾ってしまう。

## 6.1 report.md を書く

```bash
node -e '
Promise.all([
  import("kiai-sp/lib/spec-testing/report.mjs"),
  import("kiai-sp/lib/spec-testing/ledger.mjs"),
  import("kiai-sp/lib/spec-testing/paths.mjs"),
]).then(async ([report, ledger, paths]) => {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const dir = "<artifact_dir>";
  const md = report.renderReport({
    specPaths: ["<spec_path>"],
    baseBranch: "<base_branch>",
    diffRange: "<diff_range>",
    cases: ledger.readCases(paths.casesPath(dir)),
    requirements: ledger.readRequirements(paths.requirementsPath(dir)),
    progress: JSON.parse(readFileSync(paths.progressPath(dir), "utf8")),
    environments: <Phase 1 で立てた環境の配列>,
    extraCommands: <追加した結合テストと E2E の実行コマンドの配列>,
  });
  writeFileSync(paths.reportPath(dir), md, "utf8");
});
'
```

`baseBranch` と `diffRange` は 6.0 で確定した値をそのまま渡す。ここで新しく
`git` を叩いて求め直さない。

`extraCommands` を空のまま出さない。結合テストや E2E を追加したのに実行方法を
書かないと、誰も実行できないまま残る。

## 6.2 納品してよいファイルかを検査する

**commit の前に必ず通す。**

```bash
node -e '
import("kiai-sp/lib/spec-testing/delivery-check.mjs").then((m) => {
  const r = m.checkArtifacts("<artifact_dir>");
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
});
'
```

非 0 で終わったら **停止する。** 挙がった `problems` を直してから通し直す。

よくあるもの:

| 理由 | 直し方 |
|---|---|
| スクリプトとして解釈される拡張子 | 消す。環境定義ならプロダクトコード側に移す |
| 実行権限がついている | 実行権限を落とす |
| 直下に置いてよいファイルの一覧に無い | 消すか、証跡ならケースのディレクトリへ移す |
| 書き込みの一時ファイルが残っている | 消す。台帳が壊れていないかも確認する |

## 6.3 ブランチと投稿先を決める

6.0 で確定した `<base_branch>` / `<remote>` をそのまま使う。ここで `collectGit()` を
呼び直さない。

```bash
node -e '
import("kiai-sp/lib/spec-testing/branch-plan.mjs").then((m) => {
  console.log(JSON.stringify(m.planDelivery({
    baseBranch: "<base_branch>",
    remote: "<remote>",
    specSlug: "<spec 名ベース>",
  }), null, 2));
});
'
```

throw したら停止する。**base を推測で決めない。**

base は検証開始時点のブランチである。**main に読み替えない。**

## 6.4 コミットする

`planDelivery` が返した 6 手順のとおりに進める。まず成果物ブランチを切る。

```bash
git -C <repo_root> checkout -b <branch>
```

コミットは 3 つに分ける。**6.2 の検査を通ったあとで行う。**

| コミット | 内容 | 置き場 |
|---|---|---|
| テストアーティファクト | 台帳、要件一覧、証跡、レポート | `docs/superpowers/testing/<spec 名ベース>/` |
| テストコード | 単体・結合・E2E で実装したもの | プロダクトコードの通常の置き場 |
| 環境定義 | Tier 2 で立てた環境の作り方 | プロダクトコードのリポジトリルート付近 |

```bash
git -C <repo_root> add docs/superpowers/testing/<spec 名ベース>/
git -C <repo_root> commit -m "test: <spec 名ベース> のテストアーティファクトを追加する"

git -C <repo_root> add <テストコードとして実装したファイル>
git -C <repo_root> commit -m "test: <spec 名ベース> のテストコードを追加する"

git -C <repo_root> add <環境定義ファイル>
git -C <repo_root> commit -m "chore: <spec 名ベース> の検証用環境定義を追加する"
```

該当するものが無いコミットは作らない。**空コミットは作らない。**

## 6.5 push して PR を作る

push できるのは `planDelivery` が返した成果物ブランチだけである。ガードが他への
push と force push を止める。止められたら**迂回しない。** ブランチ名が計画とずれて
いる。

PR の base は `prBase`。本文には `report.md` の集計と、失敗したケースの一覧を入れる。

## 6.6 納品完了マーカーを書く

**push と PR 作成が成功したら、最後に必ず書く。** 完走ゲートはこのファイルの有無で
Phase 6 が終わったかを判定する。書かないと、台帳の消化が終わっているのに完走ゲートが
「まだ納品が終わっていない」としてブロックし続ける。

```bash
node -e '
import("node:fs").then(({ writeFileSync }) => {
  writeFileSync(
    "<artifact_dir>/delivered.json",
    JSON.stringify({ delivered_at: new Date().toISOString(), branch: "<branch>", pr: "<PR の URL>" }, null, 2) + "\n",
    "utf8",
  );
});
'
```

## やらないこと

- **main へのマージ。** マージするかは人間が PR を見て決める
- **CI 設定ファイルの変更。** 追加した結合テストや E2E を CI に組み込むかどうかは、
  実行時間・必要な環境・課金の事情がプロジェクトごとに違う。無人で決めてよいこと
  ではない。判断材料は `report.md` に書いた
- **落ちるテストを緑にする細工。** 落ちているテストを含む PR はマージできない状態で
  あるべきで、そこから直すのは人間の仕事である
- **完走したかどうかの判定。** 台帳と検査スクリプトとゲートが唯一の判定者である

## 完了したら

PR の URL と、`report.md` の集計をユーザーに伝える。ログを貼らない。
