import { describe, expect, it } from 'vitest'
import { catalog, computeCost } from '../../server/ai/catalog'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'

describe('cost', () => {
  const usage = { inputTokens: 1000, outputTokens: 500, cachedTokens: 200 }
  it('is tokens x price per million, in micro-USD', () => {
    expect(computeCost(usage, { in: 3, out: 15 })).toEqual({
      micros: Math.round(1200 * 3 + 500 * 15),
      unpriced: false,
    })
    expect(
      computeCost(
        { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0 },
        { in: 2.5, out: 10 },
      ).micros,
    ).toBe(2_500_000) // $2.50
  })
  it('unknown price is zero with a visible hint', () => {
    expect(computeCost(usage, undefined)).toEqual({ micros: 0, unpriced: true })
  })
})

describe('catalog', () => {
  async function setup() {
    const { db } = await createTestDb()
    const u = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const o = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    const p = await forUser(db, u.id).ai.create({
      kind: 'openai',
      displayName: 'P',
      baseUrl: 'https://x.test',
      presetId: 'chatgpt',
      optionsJson: {},
    })
    await forUser(db, u.id).ai.update(p.id, { modelsJson: ['b', 'a'] })
    return { db, u, o, p, cat: catalog(db) }
  }
  it('lists cached models sorted, plus models only known from routes', async () => {
    const s = await setup()
    expect(await s.cat.models(s.u.id, s.p.id)).toEqual({ ok: true, value: ['a', 'b'] })
    expect(await s.cat.models(s.o.id, s.p.id)).toEqual({ ok: false, error: { kind: 'not_found' } })
  })
  it('stores user-entered prices per user, validates, and removes them', async () => {
    const s = await setup()
    expect(await s.cat.prices(s.u.id)).toEqual({})
    expect(await s.cat.setPrice(s.u.id, 'a', { in: 3, out: 15 })).toEqual({
      ok: true,
      value: { a: { in: 3, out: 15 } },
    })
    expect(await s.cat.prices(s.o.id)).toEqual({})
    expect(await s.cat.setPrice(s.u.id, 'a', { in: -1, out: 1 })).toMatchObject({ ok: false })
    expect(await s.cat.setPrice(s.u.id, 'a', { in: NaN, out: 1 })).toMatchObject({ ok: false })
    expect(await s.cat.setPrice(s.u.id, '', { in: 1, out: 1 })).toMatchObject({ ok: false })
    expect(await s.cat.setPrice(s.u.id, 'a', null)).toEqual({ ok: true, value: {} })
  })
})
