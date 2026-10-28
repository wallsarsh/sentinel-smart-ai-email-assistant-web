// AI evaluation: scores the triage prompt against a labelled set and prints each metric next to its target.
//
//   ANTHROPIC_API_KEY=... EVAL_MODEL=<model-id> npm run eval
//
// Settings (environment): EVAL_PROVIDER anthropic | openai | compatible (default anthropic), EVAL_MODEL (required),
// EVAL_DATASET (default tools/eval/sample_dataset.jsonl), EVAL_BASE_URL, EVAL_MAX_EMAILS, EVAL_TOKEN_BUDGET,
// EVAL_MAX_COST_USD with EVAL_PRICE_IN / EVAL_PRICE_OUT (USD per million tokens), EVAL_BATCH.
// The key comes from ANTHROPIC_API_KEY or OPENAI_API_KEY. Use a key with a spending limit.
// It never runs in CI by default (refuses when CI is set unless EVAL_ALLOW_CI=1). Real mail must not be
// committed: keep donor sets outside the repository.
import { readFileSync } from 'node:fs'
import { anthropicProvider } from '../../server/ai/anthropic'
import { openAiProvider } from '../../server/ai/openai/adapter'
import { formatReport, runEval, type Row } from './run-eval'
import { TARGETS } from './metrics'

const env = process.env
const fail = (m: string): never => {
  console.error(m)
  process.exit(2)
}
if (env.CI && env.EVAL_ALLOW_CI !== '1')
  fail('Refusing to run in CI: the evaluation spends money. Set EVAL_ALLOW_CI=1 to override.')

const kind = env.EVAL_PROVIDER ?? 'anthropic'
if (!['anthropic', 'openai', 'compatible'].includes(kind))
  fail(`EVAL_PROVIDER must be anthropic, openai or compatible`)
const model = env.EVAL_MODEL ?? fail('Set EVAL_MODEL.')
const keyVar = kind === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
const apiKey = env[keyVar] || fail(`Set ${keyVar} (a key with a spending limit).`)
const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined)

const rows = readFileSync(env.EVAL_DATASET ?? 'tools/eval/sample_dataset.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Row)

const provider =
  kind === 'anthropic'
    ? anthropicProvider({ apiKey, ...(env.EVAL_BASE_URL ? { baseUrl: env.EVAL_BASE_URL } : {}) })
    : openAiProvider({
        kind: kind === 'openai' ? 'openai' : 'openai_compatible',
        apiKey,
        ...(env.EVAL_BASE_URL ? { baseUrl: env.EVAL_BASE_URL } : {}),
      })
const schemaTarget = kind === 'compatible' ? 0.95 : TARGETS.schemaValidRate
const priceIn = num(env.EVAL_PRICE_IN)
const priceOut = num(env.EVAL_PRICE_OUT)

const result = await runEval({
  provider,
  model,
  rows,
  schemaTarget,
  ...(num(env.EVAL_BATCH) ? { batch: num(env.EVAL_BATCH)! } : {}),
  ...(num(env.EVAL_MAX_EMAILS) ? { maxEmails: num(env.EVAL_MAX_EMAILS)! } : {}),
  tokenBudget: num(env.EVAL_TOKEN_BUDGET) ?? 500_000,
  ...(num(env.EVAL_MAX_COST_USD) !== undefined ? { maxCostUsd: num(env.EVAL_MAX_COST_USD)! } : {}),
  ...(priceIn !== undefined && priceOut !== undefined
    ? { price: { in: priceIn, out: priceOut } }
    : {}),
  log: (l) => console.log(l),
})
console.log(`\n${formatReport(result, model, schemaTarget)}`)
process.exit(result.missed.length ? 1 : 0)
