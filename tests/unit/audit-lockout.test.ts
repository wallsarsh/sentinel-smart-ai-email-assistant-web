import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { authService } from '../../server/auth/service'
import { AUDIT_EVENTS, auditorFor, lockDuration } from '../../server/audit/audit'
import { forUser } from '../../server/repos'

let t: Awaited<ReturnType<typeof createTestDb>>
let clock = new Date('2026-10-28T10:00:00Z')
let svc: ReturnType<typeof authService>
let uid: string
const PW = 'correct horse battery staple'

beforeAll(async () => {
  t = await createTestDb()
  svc = authService({
    db: t.db,
    baseUrl: 'https://a.test',
    now: () => clock,
    mailer: { sendPasswordReset: async () => {} },
    auditor: auditorFor(t.db, () => clock),
  })
  const r = await svc.signup({ email: 'l@x.test', password: PW })
  uid = (r as { value: { userId: string } }).value.userId
})
afterAll(async () => t.close())

const bad = () => svc.login({ email: 'l@x.test', password: 'wrong wrong wrong' })

describe('lockout', () => {
  it('durations are progressive', () => {
    expect([4, 5, 10, 15, 40].map(lockDuration)).toEqual([0, 60_000, 300_000, 1_800_000, 1_800_000])
  })

  it('locks after five failures: even the right password fails, answering like a wrong one', async () => {
    for (let i = 0; i < 5; i++) await bad()
    const locked = await svc.login({ email: 'l@x.test', password: PW })
    const wrong = await bad()
    expect(locked).toEqual(wrong)
    expect(locked.ok).toBe(false)
  })

  it('unlocks after the window and a success resets the counter', async () => {
    clock = new Date(clock.getTime() + 61_000)
    expect((await svc.login({ email: 'l@x.test', password: PW })).ok).toBe(true)
    for (let i = 0; i < 4; i++) await bad()
    expect((await svc.login({ email: 'l@x.test', password: PW })).ok).toBe(true) // 4 < 5, still allowed
  })
})

describe('audit log', () => {
  it('records the security events without content', async () => {
    const rows = await forUser(t.db, uid).audit.list()
    const events = rows.map((r) => r.event)
    for (const e of ['signup', 'login_failed', 'login_locked', 'login_success'])
      expect(events).toContain(e)
    for (const r of rows) {
      expect(AUDIT_EVENTS).toContain(r.event)
      expect(r.detail).not.toMatch(/@|password/i)
    }
  })

  it('is per user and newest first', async () => {
    const other = await svc.signup({ email: 'o@x.test', password: PW })
    const oid = (other as { value: { userId: string } }).value.userId
    expect((await forUser(t.db, oid).audit.list()).every((r) => r.userId === oid)).toBe(true)
    const mine = await forUser(t.db, uid).audit.list()
    for (let i = 1; i < mine.length; i++)
      expect(mine[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(mine[i]!.at.getTime())
  })

  it('long details are truncated', async () => {
    await auditorFor(t.db).record(uid, 'logout', 'x'.repeat(500))
    expect((await forUser(t.db, uid).audit.list(1))[0]!.detail.length).toBeLessThanOrEqual(120)
  })
})
