import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { MAX_HINTS, normalizePattern } from '../../server/repos/sender-rules'

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const r = forUser(db, user.id)
  const a1 = await r.accounts.create({ type: 'imap', email: 'a@x.test', displayName: '', color: 1 })
  const a2 = await r.accounts.create({ type: 'imap', email: 'b@x.test', displayName: '', color: 1 })
  return { db, user, other, r, a1, a2 }
}

describe('sender rules', () => {
  it('normalises and validates patterns', () => {
    expect(normalizePattern(' Boss@Corp.Example ')).toBe('boss@corp.example')
    expect(normalizePattern('@News.Example')).toBe('@news.example')
    for (const bad of ['', 'boss', '@', 'a@b', 'a b@c.d', '@@x.y', 'x@y@z.w'])
      expect(normalizePattern(bad), bad).toBeNull()
  })

  it('adds, lists, de-duplicates and removes global rules', async () => {
    const s = await setup()
    expect(await s.r.rules.add('vip', 'boss@corp.example')).toBe(true)
    expect(await s.r.rules.add('vip', 'BOSS@corp.example')).toBe(true)
    expect(await s.r.rules.add('mute', '@news.example')).toBe(true)
    expect(await s.r.rules.add('vip', 'nonsense')).toBe(false)
    expect(await s.r.rules.add('correction' as never, 'a@b.example')).toBe(false)
    const rows = await s.r.rules.list()
    expect(rows.map((x) => [x.rule, x.pattern])).toEqual([
      ['mute', '@news.example'],
      ['vip', 'boss@corp.example'],
    ])
    expect(await s.r.rules.remove(rows[0]!.id)).toBe(true)
    expect(await s.r.rules.remove(rows[0]!.id)).toBe(false)
  })

  it('a sender is never both VIP and muted in one scope: the latest choice wins', async () => {
    const s = await setup()
    await s.r.rules.add('vip', 'x@y.example')
    await s.r.rules.add('mute', 'x@y.example')
    expect((await s.r.rules.list()).map((x) => x.rule)).toEqual(['mute'])
    await s.r.rules.add('vip', 'x@y.example')
    expect((await s.r.rules.list()).map((x) => x.rule)).toEqual(['vip'])
  })

  it('per-account rules apply to that account only; a global rule makes them redundant', async () => {
    const s = await setup()
    await s.r.rules.add('mute', 'spam@x.example', s.a1.id)
    expect(await s.r.rules.effective(s.a1.id)).toEqual([
      { pattern: 'spam@x.example', kind: 'mute' },
    ])
    expect(await s.r.rules.effective(s.a2.id)).toEqual([])
    await s.r.rules.add('mute', 'spam@x.example', s.a1.id) // duplicate
    expect(await s.r.rules.list()).toHaveLength(1)
    await s.r.rules.add('mute', 'spam@x.example') // global supersedes
    expect((await s.r.rules.list()).map((x) => x.accountId)).toEqual([null])
    await s.r.rules.add('mute', 'spam@x.example', s.a2.id) // already covered globally
    expect(await s.r.rules.list()).toHaveLength(1)
    expect(await s.r.rules.effective(s.a2.id)).toEqual([
      { pattern: 'spam@x.example', kind: 'mute' },
    ])
  })

  it('effective rules are de-duplicated across global and account scope', async () => {
    const s = await setup()
    await s.r.rules.add('vip', 'a@b.example')
    await s.r.rules.add('mute', 'a@b.example', s.a1.id)
    const e = await s.r.rules.effective(s.a1.id)
    expect(e).toHaveLength(2)
  })

  it('corrections are remembered per sender (one each) and become bounded hints, newest first', async () => {
    const s = await setup()
    await s.r.rules.setCorrection('News@Vendor.example', 'low')
    await s.r.rules.setCorrection('news@vendor.example', 'high') // replaces
    expect(await s.r.rules.correctionFor('NEWS@vendor.example')).toBe('high')
    expect(await s.r.rules.correctionFor('nobody@x.example')).toBeNull()
    for (let i = 0; i < 15; i++) await s.r.rules.setCorrection(`p${i}@x.example`, 'medium')
    const hints = await s.r.rules.hints()
    expect(hints).toHaveLength(MAX_HINTS)
    expect(hints[0]).toBe('p14@x.example → user marks Medium importance')
    expect(hints.every((h) => h.length <= 160)).toBe(true)
    expect((await s.r.rules.list()).filter((x) => x.rule === 'correction')).toHaveLength(16)
  })

  it('never crosses users', async () => {
    const s = await setup()
    await s.r.rules.add('vip', 'x@y.example')
    await s.r.rules.setCorrection('x@y.example', 'low')
    const o = forUser(s.db, s.other.id).rules
    expect(await o.list()).toEqual([])
    expect(await o.hints()).toEqual([])
    expect(await o.correctionFor('x@y.example')).toBeNull()
    const id = (await s.r.rules.list())[0]!.id
    expect(await o.remove(id)).toBe(false)
  })
})
