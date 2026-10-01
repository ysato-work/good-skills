# kiai

Claude Code プラグインマーケットプレイス。

## 収録プラグイン

| プラグイン | スキル | 用途 |
| --- | --- | --- |
| `wakaranai` | `wakaranai` | 人間の発話にローマ字 `wakaranai` が含まれたとき、直前の assistant 発話を人間が理解できる形に組み直して出し直す |
| `wakaranai` | `kimoi` | 人間の発話にローマ字 `kimoi` が含まれたとき、直前の assistant 発話のキモさを取り除いて出し直す。ローマ字 `sangyo` でも発動し、そのときは 3 行以内で出し直す |
| `kiai-sp` | | superpowers の個人フォーク。TDD・デバッグ・計画立案・コードレビューの進め方をまとめたスキル群 |
| `pull-request` | `pr-description` | PR の説明文と diff への行コメントを書いて投稿する。AI が書いたとわかる文面を、スクリプトの検出とセルフレビューで抑える |

## インストール

```bash
# 1. マーケットプレイスを登録
claude plugin marketplace add ysato-work/good-skills

# 2. 好きなプラグインを入れる（プラグイン名@マーケットプレイス名）
claude plugin install wakaranai@kiai
```

ローカルパスから入れる場合:

```bash
claude plugin marketplace add /path/to/good-skills
```

## 管理コマンド

```bash
claude plugin list                          # インストール済み一覧
claude plugin details wakaranai@kiai        # 中身とトークンコスト
claude plugin update wakaranai@kiai         # 更新
claude plugin uninstall wakaranai@kiai      # アンインストール
claude plugin marketplace update kiai       # マーケットプレイス側の更新
```

## 構造

```
good-skills/
├── .claude-plugin/marketplace.json   # マーケットプレイス宣言
└── <plugin-name>/
    ├── .claude-plugin/plugin.json
    ├── skills/<skill-name>/SKILL.md
    └── agents/<skill-name>/*.md      # サブエージェントを使うプラグインのみ
```

1 プラグイン = 1 ディレクトリ。新しいプラグインを追加するときは同じ階層にディレクトリを作り、`marketplace.json` の `plugins` 配列に `{name, source}` を追記する。
