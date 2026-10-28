import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aiBench, SAMPLES } from '../../server/ai/bench'
import { err, ok } from '../../shared/errors/result'

const goodJson = JSON.stringify({
  results: SAMPLES.map((_, i) => ({
    id: `e${i + 1}`,
    category: 'other',
    importance: 'low',
    urgency: 'notUrgent',
    needsReply: false,
    summary: 's',
    reason: 'r',
    actionItems: [],
    confidence: 0.5,
  })),
})

function fakeGateway(script: Record<string, 'good' | 'bad' | 'fail'>) {
  const seen: { userId: string; task: string; model: string; user: string }[] = []
  return {
    seen,
    gateway: {
      async complete(c: {
        userId: string
        providerId: string
        task: string
        request: { model: string; user: string }
      }) {
        seen.push({ userId: c.userId, task: c.task, model: c.request.model, user: c.request.user })
        const mode = script[c.providerId]!
        if (mode === 'fail')
          return err({ kind: 'consent_required' as const, providerId: c.providerId })
        return ok({
          text: mode === 'good' ? goodJson : '{"results":"x"}',
          usage: { inputTokens: 100, outputTokens: 40, cachedTokens: 0 },
          stop: 'end' as const,
          model: c.request.model,
          cost: { micros: 700, unpriced: false },
        })
      },
    },
  }
}
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('ai bench', () => {
  it('compares two models on synthetic samples with tokens, latency, cost and validity', async () => {
    const f = fakeGateway({ [ID_A]: 'good', [ID_B]: 'bad' })
    let t = 0
    const bench = aiBench({ gateway: f.gateway as never, clock: () => (t += 50) })
    const r = await bench.compare('u1', {
      a: { providerId: ID_A, model: 'ma' },
      b: { providerId: ID_B, model: 'mb' },
    })
    if (!r.ok) throw new Error('x')
    expect(r.value.a).toMatchObject({
      ok: true,
      validJson: true,
      tokens: { input: 100, output: 40, cached: 0 },
      costMicros: 700,
      latencyMs: expect.any(Number),
    })
    expect(r.value.b).toMatchObject({ ok: true, validJson: false })
    expect(r.value.b.errors!.length).toBeGreaterThan(0)
    expect(r.value.samples).toHaveLength(3)
    expect(f.seen.map((s) => [s.userId, s.task, s.model])).toEqual([
      ['u1', 'triage', 'ma'],
      ['u1', 'triage', 'mb'],
    ])
  })

  it('only synthetic mail is in the prompt', async () => {
    const f = fakeGateway({ [ID_A]: 'good', [ID_B]: 'good' })
    await aiBench({ gateway: f.gateway as never }).compare('u1', {
      a: { providerId: ID_A, model: 'm' },
      b: { providerId: ID_B, model: 'm' },
    })
    expect(f.seen[0]!.user).toContain('acme.example')
    expect(f.seen[0]!.user).toContain('Q3 numbers')
  })

  it('a failing side reports its failure (e.g. no consent) without hiding the other', async () => {
    const f = fakeGateway({ [ID_A]: 'good', [ID_B]: 'fail' })
    const r = await aiBench({ gateway: f.gateway as never }).compare('u1', {
      a: { providerId: ID_A, model: 'm' },
      b: { providerId: ID_B, model: 'm' },
    })
    expect(r).toMatchObject({
      ok: true,
      value: { a: { ok: true }, b: { ok: false, failure: { kind: 'consent_required' } } },
    })
  })

  it('validates input', async () => {
    const bench = aiBench({ gateway: fakeGateway({}).gateway as never })
    expect(await bench.compare('u', { a: { providerId: 'x', model: 'm' } })).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    })
    expect(await bench.compare('u', null)).toMatchObject({ ok: false })
  })

  it('has no path to real mail: imports no repository, mail, container or sync code', () => {
    const src =
      readFileSync('server/ai/bench.ts', 'utf8') +
      readFileSync('server/api/ai/bench.post.ts', 'utf8')
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
    expect(
      imports.filter(
        (i) =>
          /repos|mail\/(gmail|graph|imap|provider|oauth)|sync|container$/.test(i) &&
          !/useAiBench/.test(i),
      ),
    ).toEqual(['../../container'])
    expect(src).not.toMatch(/getMessage|\.recent\(|inbox/)
  })
})
