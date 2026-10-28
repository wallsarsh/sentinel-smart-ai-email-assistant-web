import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AiProvider, AiRequest } from '../../server/ai/types'
import { err, ok } from '../../shared/errors/result'
import { actionMatches, misses, scoreEvaluation, TARGETS } from '../../tools/eval/metrics'
import { formatReport, runEval, type Row } from '../../tools/eval/run-eval'

describe('metrics', () => {
  it('computes precision, recall, macro F1, action recall and schema rate by hand-checked example', () => {
    const r = scoreEvaluation(
      [
        { importance: 'high', needsReply: true, actions: ['send the figures'] },
        { importance: 'medium', needsReply: true, actions: [] },
        { importance: 'low', needsReply: false, actions: [] },
        { importance: 'low', needsReply: false, actions: [] },
      ],
      [
        { schemaValid: true, importance: 'high', needsReply: true, actions: ['Send figures now'] },
        { schemaValid: true, importance: 'medium', needsReply: false },
        { schemaValid: true, importance: 'low', needsReply: true },
        { schemaValid: false },
      ],
    )
    expect(r.cases).toBe(4)
    expect(r.needsReplyPrecision).toBeCloseTo(0.5)
    expect(r.needsReplyRecall).toBeCloseTo(0.5)
    expect(r.importanceMacroF1).toBeCloseTo((1 + 1 + 2 / 3) / 3)
    expect(r.actionRecall).toBe(1)
    expect(r.schemaValidRate).toBe(0.75)
    expect(misses(r)).toEqual(['needsReplyPrecision', 'needsReplyRecall', 'schemaValidRate'])
    expect(misses(r, 0.7)).not.toContain('schemaValidRate')
  })

  it('empty denominators count as perfect, mismatched lengths are rejected, invalid answers count as misses', () => {
    expect(scoreEvaluation([], []).needsReplyPrecision).toBe(1)
    expect(() =>
      scoreEvaluation([{ importance: 'low', needsReply: false, actions: [] }], []),
    ).toThrow()
    const r = scoreEvaluation(
      [{ importance: 'high', needsReply: true, actions: ['pay invoice'] }],
      [{ schemaValid: false, importance: 'high', needsReply: true, actions: ['pay invoice'] }],
    )
    expect(r.needsReplyRecall).toBe(0)
    expect(r.actionRecall).toBe(0)
  })

  it('an action matches when half of its words are present', () => {
    expect(actionMatches('Pay invoice 2041', 'please pay the invoice')).toBe(true)
    expect(actionMatches('Pay invoice 2041', 'book a table')).toBe(false)
    expect(actionMatches('a b', 'a b')).toBe(false) // no word of three letters
  })
})

const rows = (): Row[] =>
  readFileSync('tools/eval/sample_dataset.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row)

describe('sample dataset', () => {
  it('is synthetic, labelled, and covers every importance level, both reply labels and an injection', () => {
    const r = rows()
    expect(r.length).toBeGreaterThanOrEqual(10)
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length)
    expect(new Set(r.map((x) => x.expect.importance))).toEqual(new Set(['high', 'medium', 'low']))
    expect(new Set(r.map((x) => x.expect.needsReply))).toEqual(new Set([true, false]))
    expect(r.some((x) => /ignore your previous instructions/i.test(x.body))).toBe(true)
    for (const x of r) expect(x.from + x.body).not.toMatch(/@(gmail|outlook|yahoo|hotmail)\./i)
  })
})

/** A provider that answers every email in the request with [answer(row)] and reports fixed usage. */
function scripted(
  answer: (id: string, row: Row | undefined) => object | null,
  usage = { inputTokens: 100, outputTokens: 50 },
) {
  const byId = new Map(rows().map((r) => [r.id, r]))
  const calls: AiRequest[] = []
  const provider: AiProvider = {
    kind: 'openai_compatible',
    async complete(req) {
      calls.push(req)
      const blocks = [...req.user.matchAll(/<email id="(e\d+)"[^>]*>([\s\S]*?)<\/email /g)]
      const results = blocks.map(([, id, text]) => {
        const row = [...byId.values()].find((r) => text!.includes(`subject: ${r.subject}\n`))
        const a = answer(id!, row)
        return a === null ? null : { id, ...a }
      })
      return ok({
        text: JSON.stringify({ results: results.filter(Boolean) }),
        stop: 'end' as const,
        usage: { ...usage, cachedTokens: 0 },
        model: 'm',
      })
    },
    async listModels() {
      return err({ kind: 'unknown' as const })
    },
  }
  return { provider, calls }
}

describe('runEval', () => {
  it('a model that answers correctly meets every target; the report shows each metric next to its target', async () => {
    const { provider, calls } = scripted((_id, row) =>
      row
        ? {
            importance: row.expect.importance,
            needsReply: row.expect.needsReply,
            actionItems: (row.expect.actions ?? []).map((text) => ({ text })),
          }
        : null,
    )
    const r = await runEval({ provider, model: 'm', rows: rows(), batch: 5 })
    expect(r.missed).toEqual([])
    expect(r.report.cases).toBe(rows().length)
    expect(calls.length).toBe(Math.ceil(rows().length / 5))
    expect(r.tokens.input).toBe(100 * calls.length)
    const text = formatReport(r, 'm')
    for (const k of Object.keys(TARGETS)) expect(text).toContain(k)
    expect(text).toContain('prompt triage.v1')
    expect(text).not.toContain('MISS')
  })

  it('a model that obeys the injected instruction or answers badly misses targets', async () => {
    const { provider } = scripted((_id, row) =>
      row ? { importance: 'high', needsReply: true, actionItems: [] } : null,
    )
    const r = await runEval({ provider, model: 'm', rows: rows() })
    expect(r.missed).toEqual(
      expect.arrayContaining(['needsReplyPrecision', 'importanceMacroF1', 'actionRecall']),
    )
    expect(formatReport(r, 'm')).toContain('MISS')
  })

  it('answers that are missing or not valid JSON count against the schema rate', async () => {
    const bad: AiProvider = {
      kind: 'openai',
      async complete() {
        return ok({
          text: 'not json',
          stop: 'end' as const,
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
          model: 'm',
        })
      },
      async listModels() {
        return ok([])
      },
    }
    const r = await runEval({ provider: bad, model: 'm', rows: rows() })
    expect(r.report.schemaValidRate).toBe(0)
    expect(r.missed).toContain('schemaValidRate')
  })

  it('a failing provider scores everything invalid instead of throwing', async () => {
    const down: AiProvider = {
      kind: 'openai',
      async complete() {
        return err({ kind: 'network' as const })
      },
      async listModels() {
        return ok([])
      },
    }
    const r = await runEval({ provider: down, model: 'm', rows: rows().slice(0, 3) })
    expect(r.report.cases).toBe(3)
    expect(r.report.schemaValidRate).toBe(0)
  })

  it('the token budget stops new requests', async () => {
    const { provider, calls } = scripted(() => null, { inputTokens: 600, outputTokens: 400 })
    const r = await runEval({ provider, model: 'm', rows: rows(), batch: 2, tokenBudget: 2500 })
    expect(r.stopped).toBe('budget')
    expect(calls).toHaveLength(3) // 1000 tokens per request: stops once 3000 >= 2500
    expect(r.report.cases).toBe(6)
  })

  it('the spend limit uses the stated prices and stops early', async () => {
    const { provider, calls } = scripted(() => null, { inputTokens: 1_000_000, outputTokens: 0 })
    const r = await runEval({
      provider,
      model: 'm',
      rows: rows(),
      batch: 4,
      price: { in: 3, out: 15 },
      maxCostUsd: 5,
    })
    expect(calls).toHaveLength(2) // $3 after the first request, $6 after the second
    expect(r.stopped).toBe('cost')
    expect(r.costUsd).toBeCloseTo(6)
    expect(formatReport(r, 'm')).toContain('estimated spend: $6.0000')
  })

  it('maxEmails limits the set', async () => {
    const { provider } = scripted(() => null)
    expect((await runEval({ provider, model: 'm', rows: rows(), maxEmails: 4 })).report.cases).toBe(
      4,
    )
  })
})

describe('the command', () => {
  const run = (env: Record<string, string>) => {
    try {
      execFileSync('npx', ['tsx', 'tools/eval/run.ts'], {
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
        stdio: 'pipe',
      })
      return { code: 0, out: '' }
    } catch (e) {
      const x = e as { status: number; stderr: Buffer }
      return { code: x.status, out: String(x.stderr) }
    }
  }

  it('refuses to run in CI by default, and without a model or a key, never reaching the network', () => {
    const ci = run({ CI: 'true', EVAL_MODEL: 'm', ANTHROPIC_API_KEY: 'k' })
    expect(ci.code).toBe(2)
    expect(ci.out).toContain('Refusing to run in CI')
    expect(run({}).out).toContain('Set EVAL_MODEL')
    expect(run({ EVAL_MODEL: 'm' }).out).toContain('Set ANTHROPIC_API_KEY')
  }, 60_000)

  it('is not part of the normal test run or the CI pipeline', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).not.toMatch(/npm run eval|tools\/eval/)
    expect(readFileSync('vitest.config.ts', 'utf8')).not.toContain('tools/eval')
  })
})
