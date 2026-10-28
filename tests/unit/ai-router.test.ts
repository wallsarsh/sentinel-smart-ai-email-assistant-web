import { describe, expect, it } from 'vitest'
import { aiRouter, isRetryable } from '../../server/ai/router'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { err, ok } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'

describe('fallback rules', () => {
  const cases: [AppFailure, boolean][] = [
    [{ kind: 'network' }, true],
    [{ kind: 'rate_limited' }, true],
    [{ kind: 'auth', problem: 'invalid_credentials' }, true],
    [{ kind: 'provider', status: 500, code: 'x' }, true],
    [{ kind: 'provider', status: 529, code: 'x' }, true],
    [{ kind: 'provider', status: null, code: 'x' }, true],
    [{ kind: 'provider', status: 408, code: 'x' }, true],
    [{ kind: 'provider', status: 400, code: 'x' }, false],
    [{ kind: 'provider', status: 422, code: 'x' }, false],
    [{ kind: 'consent_required', providerId: 'p' }, false],
    [{ kind: 'cap_reached', scope: 'cost' }, false],
    [{ kind: 'validation', code: 'x' }, false],
    [{ kind: 'forbidden' }, false],
    [{ kind: 'not_found' }, false],
    [{ kind: 'ai_output', problem: 'refusal' }, false],
    [{ kind: 'unknown' }, false],
  ]
  it.each(cases)('%j → retryable=%s', (f, want) => expect(isRetryable(f)).toBe(want))
})

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const repos = forUser(db, user.id)
  const mk = (n: string) =>
    repos.ai.create({
      kind: 'openai',
      displayName: n,
      baseUrl: 'https://x.test',
      presetId: 'chatgpt',
      optionsJson: {},
    })
  const [a, b, c] = [await mk('A'), await mk('B'), await mk('C')]
  const script = new Map<string, AppFailure | 'ok'>()
  const calls: { providerId: string; model: string; maxTokens: number; temperature?: number }[] = []
  const gateway = {
    async complete(call: {
      providerId: string
      request: { model: string; maxTokens: number; temperature?: number }
    }) {
      calls.push({
        providerId: call.providerId,
        model: call.request.model,
        maxTokens: call.request.maxTokens,
        temperature: call.request.temperature,
      })
      const r = script.get(call.providerId) ?? 'ok'
      return r === 'ok'
        ? ok({
            text: 'x',
            usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
            stop: 'end' as const,
            model: call.request.model,
            cost: { micros: 0, unpriced: true },
          })
        : err(r)
    },
  }
  const router = aiRouter({ db, gateway })
  return { db, user, other, repos, a, b, c, script, calls, router }
}
const build = () => ({ system: 's', user: 'u', maxTokens: 100 })

describe('router', () => {
  it('uses the first route and passes route parameters', async () => {
    const s = await setup()
    await s.router.setChain(s.user.id, 'triage', [
      { providerId: s.a.id, model: 'm-a', params: { maxTokens: 900, temperature: 0.1 } },
      { providerId: s.b.id, model: 'm-b' },
    ])
    const r = await s.router.complete(s.user.id, 'triage', build)
    expect(r).toMatchObject({
      ok: true,
      value: { attempts: 1, route: { providerId: s.a.id, model: 'm-a' } },
    })
    expect(s.calls).toEqual([
      { providerId: s.a.id, model: 'm-a', maxTokens: 900, temperature: 0.1 },
    ])
  })

  it('falls back on retryable failures in order, and stops at a non-retryable one', async () => {
    const s = await setup()
    await s.router.setChain(s.user.id, 'draft', [
      { providerId: s.a.id, model: 'a' },
      { providerId: s.b.id, model: 'b' },
      { providerId: s.c.id, model: 'c' },
    ])
    s.script.set(s.a.id, { kind: 'network' })
    s.script.set(s.b.id, { kind: 'provider', status: 503, code: 'x' })
    expect(await s.router.complete(s.user.id, 'draft', build)).toMatchObject({
      ok: true,
      value: { attempts: 3, route: { model: 'c' } },
    })
    s.calls.length = 0
    s.script.set(s.b.id, { kind: 'cap_reached', scope: 'tokens' })
    expect(await s.router.complete(s.user.id, 'draft', build)).toEqual({
      ok: false,
      error: { kind: 'cap_reached', scope: 'tokens' },
    })
    expect(s.calls.map((c) => c.model)).toEqual(['a', 'b'])
    s.script.set(s.b.id, { kind: 'network' })
    s.script.set(s.c.id, { kind: 'rate_limited', retryAfterSeconds: 5 })
    expect(await s.router.complete(s.user.id, 'draft', build)).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: 5 },
    })
  })

  it('uses the default chain when a task has none, and reports a missing route', async () => {
    const s = await setup()
    expect(await s.router.complete(s.user.id, 'brief', build)).toMatchObject({
      ok: false,
      error: { code: 'no_route' },
    })
    await s.router.setChain(s.user.id, 'default', [{ providerId: s.c.id, model: 'dflt' }])
    expect(await s.router.complete(s.user.id, 'brief', build)).toMatchObject({
      ok: true,
      value: { route: { model: 'dflt' } },
    })
  })

  it('changes apply on the next call', async () => {
    const s = await setup()
    await s.router.setChain(s.user.id, 'triage', [{ providerId: s.a.id, model: 'old' }])
    await s.router.complete(s.user.id, 'triage', build)
    await s.router.setChain(s.user.id, 'triage', [{ providerId: s.b.id, model: 'new' }])
    await s.router.complete(s.user.id, 'triage', build)
    expect(s.calls.map((c) => c.model)).toEqual(['old', 'new'])
  })

  it('validates chains: ownership, length, params, and per-user isolation', async () => {
    const s = await setup()
    expect(
      await s.router.setChain(s.other.id, 'triage', [{ providerId: s.a.id, model: 'm' }]),
    ).toMatchObject({ ok: false, error: { code: 'unknown_provider' } })
    expect(
      await s.router.setChain(
        s.user.id,
        'triage',
        Array.from({ length: 5 }, () => ({ providerId: s.a.id, model: 'm' })),
      ),
    ).toMatchObject({ ok: false })
    expect(
      await s.router.setChain(s.user.id, 'triage', [
        { providerId: s.a.id, model: 'm', params: { temperature: 9 } },
      ]),
    ).toMatchObject({ ok: false })
    expect(
      await s.router.setChain(s.user.id, 'triage', [{ providerId: s.a.id, model: ' ' }]),
    ).toMatchObject({ ok: false })
    expect(await s.router.setChain(s.user.id, 'nope' as never, [])).toMatchObject({ ok: false })
    expect(await s.router.routesFor(s.other.id, 'triage')).toEqual([])
    await s.router.setChain(s.user.id, 'triage', [{ providerId: s.a.id, model: 'm' }])
    expect(await s.router.setChain(s.user.id, 'triage', [])).toEqual({ ok: true, value: [] })
  })
})
