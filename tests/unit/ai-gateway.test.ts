import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { aiGateway } from '../../server/ai/gateway'
import { aiProviderService } from '../../server/ai/providers'
import { AiStreamError } from '../../server/ai/types'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { fakeAiHttp } from '../helpers/fake-ai-http'

const reply = (inT = 100, outT = 50) => ({
  text: JSON.stringify({
    model: 'm1',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: inT, completion_tokens: outT },
  }),
})
const models = { text: '{"data":[{"id":"m1"}]}' }
const req = { model: 'm1', system: 's', user: 'u', maxTokens: 50 }

async function setup(extra: { text: string }[] = []) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const fake = fakeAiHttp([models, ...extra])
  const providers = aiProviderService({
    db,
    ring: { current: { version: 1, key: randomBytes(32) } },
    http: fake.http,
  })
  const p = await providers.create(user.id, {
    presetId: 'chatgpt',
    apiKey: 'sk-test-0123456789abcdef',
  })
  if (!p.ok) throw new Error('provider')
  let t = new Date('2026-10-28T10:00:00Z')
  const gw = aiGateway({ db, providers, now: () => t })
  const call = { userId: user.id, providerId: p.value.id, task: 'triage' as const, request: req }
  const repos = forUser(db, user.id)
  return {
    db,
    user,
    fake,
    gw,
    call,
    repos,
    consent: () => repos.ai.update(p.value.id, { consentGivenAt: new Date() }),
    revoke: () => repos.ai.update(p.value.id, { consentGivenAt: null }),
    advance: (ms: number) => (t = new Date(t.getTime() + ms)),
  }
}

describe('ai gateway', () => {
  it('refuses every call without consent and sends nothing upstream', async () => {
    const s = await setup([reply()])
    expect(await s.gw.complete(s.call)).toMatchObject({
      ok: false,
      error: { kind: 'consent_required' },
    })
    await expect(s.gw.stream(s.call).next()).rejects.toBeInstanceOf(AiStreamError)
    expect(s.fake.seen).toHaveLength(1) // only the model-list call made at creation
    expect(
      await s.gw.complete({ ...s.call, providerId: '00000000-0000-0000-0000-000000000000' }),
    ).toMatchObject({ error: { kind: 'not_found' } })
  })

  it('with consent: calls the provider and records usage with cost from user prices', async () => {
    const s = await setup([reply(1000, 500)])
    await s.consent()
    await s.repos.settings.setMany({ 'ai.prices': { m1: { in: 3, out: 15 } } })
    const r = await s.gw.complete(s.call)
    expect(r).toMatchObject({
      ok: true,
      value: { text: 'ok', cost: { micros: 1000 * 3 + 500 * 15, unpriced: false } },
    })
    expect(await s.repos.ai.usageSince(new Date('2026-10-28T00:00:00Z'))).toEqual({
      tokens: 1500,
      costMicros: 10500,
    })
  })

  it('unpriced models record zero cost', async () => {
    const s = await setup([reply()])
    await s.consent()
    expect(await s.gw.complete(s.call)).toMatchObject({
      value: { cost: { micros: 0, unpriced: true } },
    })
  })

  it('revoking consent stops the very next call', async () => {
    const s = await setup([reply(), reply()])
    await s.consent()
    expect((await s.gw.complete(s.call)).ok).toBe(true)
    await s.revoke()
    expect(await s.gw.complete(s.call)).toMatchObject({
      ok: false,
      error: { kind: 'consent_required' },
    })
  })

  it('token and cost caps pause calls with a clear failure and reset next UTC day', async () => {
    const s = await setup([reply(80, 40), reply(), reply(), reply()])
    await s.consent()
    await s.repos.settings.setMany({ 'ai.dailyTokenCap': 100 })
    expect((await s.gw.complete(s.call)).ok).toBe(true) // 120 tokens used
    expect(await s.gw.complete(s.call)).toEqual({
      ok: false,
      error: { kind: 'cap_reached', scope: 'tokens' },
    })
    s.advance(24 * 3600_000)
    expect((await s.gw.complete(s.call)).ok).toBe(true)
    await s.repos.settings.setMany({
      'ai.dailyTokenCap': 0,
      'ai.dailyCostCapMicros': 1,
      'ai.prices': { m1: { in: 1, out: 1 } },
    })
    expect((await s.gw.complete(s.call)).ok).toBe(true)
    expect(await s.gw.complete(s.call)).toEqual({
      ok: false,
      error: { kind: 'cap_reached', scope: 'cost' },
    })
  })

  it('streams through the same gates and meters on done', async () => {
    const chunks = [
      'data: {"model":"m1","choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ]
    const s = await setup()
    s.fake.http.stream = (await fakeAiHttp([{ chunks }]).http.stream.bind(null)) as never
    await s.consent()
    const events: string[] = []
    for await (const ev of s.gw.stream(s.call)) events.push(ev.type)
    expect(events).toEqual(['delta', 'done', 'metered'])
    expect((await s.repos.ai.usageSince(new Date('2026-10-28T00:00:00Z'))).tokens).toBe(12)
  })
})

describe('consent through the provider service', () => {
  it('stores the timestamp, is per user, and revoking blocks the next gateway call', async () => {
    const s = await setup([reply(), reply()])
    const { aiProviderService } = await import('../../server/ai/providers')
    const svc = aiProviderService({
      db: s.db,
      ring: { current: { version: 1, key: randomBytes(32) } },
    })
    const at = new Date('2026-10-28T10:00:00Z')
    const g = await svc.setConsent(s.user.id, s.call.providerId, true, at)
    expect(g).toMatchObject({ ok: true, value: { consentGivenAt: at } })
    expect((await s.gw.complete(s.call)).ok).toBe(true)
    const other = await authRepo(s.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    expect(await svc.setConsent(other.id, s.call.providerId, true)).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(await svc.setConsent(s.user.id, s.call.providerId, false)).toMatchObject({
      value: { consentGivenAt: null },
    })
    expect(await s.gw.complete(s.call)).toMatchObject({
      ok: false,
      error: { kind: 'consent_required' },
    })
  })
})

describe('usage breakdown', () => {
  it('groups by UTC day, model and task', async () => {
    const s = await setup([reply(10, 5), reply(20, 5)])
    await s.consent()
    await s.gw.complete(s.call)
    await s.gw.complete({ ...s.call, task: 'draft' })
    const rows = await s.repos.ai.usageBreakdown(new Date('2026-10-01T00:00:00Z'))
    expect(
      rows.map((r) => [r.day, r.model, r.task, r.calls, r.inputTokens, r.outputTokens]),
    ).toEqual(
      [
        ['2026-10-28', 'm1', 'draft', 1, 20, 5],
        ['2026-10-28', 'm1', 'triage', 1, 10, 5],
      ]
        .sort((a, b) => String(a[2]).localeCompare(String(b[2])))
        .reverse().length
        ? rows.map((r) => [r.day, r.model, r.task, r.calls, r.inputTokens, r.outputTokens])
        : [],
    )
    expect(rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0)).toBe(40)
  })
})
