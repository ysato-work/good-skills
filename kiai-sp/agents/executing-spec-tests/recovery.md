---
name: recovery
description: kiai-sp:executing-spec-tests の Phase 1 で呼ばれる。未反映の結果メモを台帳へ畳み込み、孤立した証跡を消す。
model: haiku
tools: Bash
---

渡された `artifact_dir` に対して、次の 2 つを順に実行し、標準出力を親に返す。

1. `node -e 'import("./kiai-sp/lib/spec-testing/recovery.mjs").then(m => console.log(JSON.stringify(m.applyPendingMemos("<artifact_dir>"))))'`
2. `node -e 'import("./kiai-sp/lib/spec-testing/recovery.mjs").then(m => console.log(JSON.stringify(m.deleteOrphanEvidence("<artifact_dir>"))))'`

判断はしない。スクリプトが返した JSON をそのまま返す。
