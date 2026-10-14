export const meta = {
  name: 'executing-spec-tests',
  description: '台帳を上から逐次消化する Dynamic Workflow 版。単体は 1 体 10 件バッチ、結合と E2E は 1 ケース 1 体。証跡を機械検査し、結果メモ経由で台帳を書き戻す。',
  phases: [
    { title: 'Phase1', detail: '台帳読み → 復旧 → 前提調査' },
    { title: 'Phase2', detail: '1 まとまり実施 → 反映' },
    { title: 'Phase3', detail: '証跡確認 (差し戻しのみ)' },
    { title: 'Phase4', detail: '継続判定 (決定論式)' },
  ],
}

// 定数はここに集約する
const MAX_ITER = 200 // WORKFLOW_MAX_ITER と同値。子への引数用に静的に持つ

log(`args: ${JSON.stringify({ artifact_dir: args?.artifact_dir, now: args?.now })}`)

if (!args?.artifact_dir) throw new Error('args.artifact_dir が必要')
if (!args?.now) throw new Error('args.now (ISO8601) が必要')

const ARTIFACT = args.artifact_dir

// Phase 1
phase('Phase1')
const ledgerFirst = await agent(
  `artifact_dir=${ARTIFACT} を対象に kiai-sp:executing-spec-tests:ledger-reader を実行`,
  { agentType: 'kiai-sp:executing-spec-tests:ledger-reader', phase: 'Phase1', model: 'haiku' },
)
log(`ledger (first read): ${String(ledgerFirst).slice(0, 200)}`)

const recovered = await agent(
  `artifact_dir=${ARTIFACT} を対象に kiai-sp:executing-spec-tests:recovery を実行`,
  { agentType: 'kiai-sp:executing-spec-tests:recovery', phase: 'Phase1', model: 'haiku' },
)
log(`recovery: ${String(recovered).slice(0, 200)}`)

// 戻り値は使わない (副作用として台帳の復旧結果を再確認するため)
await agent(
  `artifact_dir=${ARTIFACT} を対象に kiai-sp:executing-spec-tests:ledger-reader を再実行`,
  { agentType: 'kiai-sp:executing-spec-tests:ledger-reader', phase: 'Phase1', model: 'haiku' },
)

// 戻り値は使わない (副作用として prerequisites.json を書くため)
await agent(
  `repo_root と artifact_dir=${ARTIFACT} を対象に kiai-sp:executing-spec-tests:prerequisite-investigator を実行`,
  { agentType: 'kiai-sp:executing-spec-tests:prerequisite-investigator', phase: 'Phase1', model: 'sonnet' },
)

// Phase 2〜4 の周回
for (let iter = 0; iter < MAX_ITER; iter++) {
  const ledgerJson = await agent(
    `artifact_dir=${ARTIFACT} で ledger を JSON で取り、次のまとまり (nextBatch) を JSON で返す`,
    { agentType: 'kiai-sp:executing-spec-tests:ledger-reader', phase: `Phase2:iter${iter}`, model: 'haiku' },
  )

  // ledger-reader.md の規約: batch-plan.mjs の出力をそのまま最終行に出す。
  // 最終非空行だけを JSON として読む。壊れていたら黙って null にせず throw する
  const lastLine = String(ledgerJson).trim().split('\n').pop()
  const parsed = JSON.parse(lastLine)
  const batch = parsed?.batch ?? null

  if (!batch || (batch.caseIds.length === 0 && batch.exhaustedCaseIds.length === 0)) {
    log(`iter=${iter}: no batch, exit loop`)
    break
  }

  // 台帳由来の値はエージェント呼び出しのプロンプトに埋め込む前に検証する (プロンプトインジェクション対策)
  const LEVEL_RE = /^(unit|integration|e2e)$/
  if (!LEVEL_RE.test(batch.level)) throw new Error(`nextBatch が返した level が不正: ${batch.level}`)
  const CASE_ID_RE = /^T-\d{3}$/
  for (const id of [...batch.caseIds, ...batch.exhaustedCaseIds]) {
    if (!CASE_ID_RE.test(id)) throw new Error(`nextBatch が返した case_id が不正: ${id}`)
  }

  // 実施するケースがあるときだけ batch-runner を立てる
  if (batch.caseIds.length > 0) {
    await agent(
      `artifact_dir=${ARTIFACT} level=${batch.level} case_ids=${batch.caseIds.join(',')} で batch-runner を実行。prerequisites と case_rows_json は artifact_dir の cases.tsv から読み取ること`,
      { agentType: 'kiai-sp:executing-spec-tests:batch-runner', phase: `Phase2:iter${iter}`, model: 'sonnet' },
    )
  }

  // 実施ケースがあれば証跡確認へ。exhausted だけの周回ではスキップ。
  // reflector より先に呼ぶ: evidence-checker の差し戻しは return-case.mjs の returnCase
  // 経由で台帳 (cases.tsv) の returns 列を直接書き換える (差し戻し回数は台帳側の永続列
  // で数えるので、この呼び出し順自体は RETURNS_MAX の正しさには影響しない)。ただし
  // reflector (reflect-batch.mjs) が先に status を pass/fail/error へ確定させてしまうと、
  // evidence-checker の差し戻しが確定済みの結果を todo に戻す形になり手戻りが増えるため、
  // この順序を保つ。差し戻された case は returnCase が証跡を削除するため、直後の
  // reflector 呼び出しは hasEvidence=false を見て todo/error に正しく落とす
  // (apply-result.mjs の decideStatus)
  if (batch.caseIds.length > 0) {
    phase(`Phase3:iter${iter}`)
    await agent(
      `artifact_dir=${ARTIFACT} case_ids=${batch.caseIds.join(',')} で evidence-checker を実行`,
      { agentType: 'kiai-sp:executing-spec-tests:evidence-checker', phase: `Phase3:iter${iter}`, model: 'sonnet' },
    )
  }

  // 反映は必ず呼ぶ。exhausted 行を error に確定させるため
  await agent(
    `artifact_dir=${ARTIFACT} level=${batch.level} case_ids=${batch.caseIds.join(',')} exhausted_ids=${batch.exhaustedCaseIds.join(',')} で reflector を実行`,
    { agentType: 'kiai-sp:executing-spec-tests:reflector', phase: `Phase2:iter${iter}`, model: 'haiku' },
  )
}

// Phase 4 の終了判定は for ループの break と MAX_ITER の到達で決まる
phase('Phase4')
log(`loop finished`)

return { done: true }
