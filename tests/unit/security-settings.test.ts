import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { authService } from '../../server/auth/service'
import { mfaService } from '../../server/auth/mfa'
import { auditorFor } from '../../server/audit/audit'
import { forUser } from '../../server/repos'
import { totpAt } from '../../server/security/totp'

let t: Awaited<ReturnType<typeof createTestDb>>
let clock = new Date('2026-10-28T10:00:00Z')
let svc: ReturnType<typeof authService>
const PW = 'correct horse battery staple'
const PW2 = 'another long passphrase here'
const advance = (ms: number) => (clock = new Date(clock.getTime() + ms))

beforeAll(async () => {
  t = await createTestDb()
  svc = authService({
    db: t.db,
    baseUrl: 'https://a.test',
    now: () => clock,
    mailer: { sendPasswordReset: async () => {} },
    auditor: auditorFor(t.db, () => clock),
  })
})
afterAll(async () => t.close())

async function user(email: string) {
  const r = await svc.signup({ email, password: PW })
  if (!r.ok) throw new Error('signup')
  return { id: r.value.userId, first: r.value.token }
}

describe('active sessions', () => {
  it('lists live sessions with the current one marked, and no tokens or full hashes', async () => {
    const u = await user('list@x.test')
    const second = await svc.sessions.create(u.id, 'Firefox on Linux')
    const rows = await svc.sessions.list(u.id, u.first)
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.current)).toHaveLength(1)
    expect(rows.find((r) => r.userAgent === 'Firefox on Linux')!.current).toBe(false)
    for (const r of rows) {
      expect(r.handle).toMatch(/^[0-9a-f]{16}$/)
      expect(JSON.stringify(r)).not.toContain(u.first)
      expect(JSON.stringify(r)).not.toContain(second)
    }
  })

  it('a revoked session loses access immediately; the others keep working', async () => {
    const u = await user('revoke@x.test')
    const other = await svc.sessions.create(u.id, 'Other browser')
    expect(await svc.sessions.validate(other)).not.toBeNull()
    const handle = (await svc.sessions.list(u.id, u.first)).find((s) => !s.current)!.handle

    expect(await svc.sessions.revokeByHandle(u.id, handle)).toBe(true)
    expect(await svc.sessions.validate(other)).toBeNull() // the very next request is refused
    expect(await svc.sessions.validate(u.first)).not.toBeNull()
    expect(await svc.sessions.list(u.id, u.first)).toHaveLength(1)
    expect(await svc.sessions.revokeByHandle(u.id, handle)).toBe(false) // already ended
  })

  it("nobody can end someone else's session, and malformed handles do nothing", async () => {
    const a = await user('a-owner@x.test')
    const b = await user('b-other@x.test')
    const bHandle = (await svc.sessions.list(b.id, b.first))[0]!.handle
    expect(await svc.sessions.revokeByHandle(a.id, bHandle)).toBe(false)
    expect(await svc.sessions.validate(b.first)).not.toBeNull()
    for (const bad of ['', 'xyz', '%', 'A'.repeat(16), bHandle.slice(0, 8)])
      expect(await svc.sessions.revokeByHandle(a.id, bad)).toBe(false)
  })

  it('"sign out everywhere else" keeps only this session', async () => {
    const u = await user('others@x.test')
    const t2 = await svc.sessions.create(u.id)
    const t3 = await svc.sessions.create(u.id)
    await svc.sessions.revokeAll(u.id, u.first)
    expect(await svc.sessions.validate(u.first)).not.toBeNull()
    expect(await svc.sessions.validate(t2)).toBeNull()
    expect(await svc.sessions.validate(t3)).toBeNull()
  })

  it('expired sessions are not listed', async () => {
    const u = await user('expired@x.test')
    advance(15 * 24 * 3600 * 1000)
    expect(await svc.sessions.list(u.id, u.first)).toHaveLength(0)
    advance(-15 * 24 * 3600 * 1000)
  })
})

describe('change password', () => {
  it('needs the current password, applies the policy, and records refusals', async () => {
    const u = await user('pw1@x.test')
    expect(await svc.changePassword(u.id, 'wrong password!!', PW2, u.first)).toMatchObject({
      ok: false,
      error: { kind: 'auth' },
    })
    expect(await svc.changePassword(u.id, PW, 'short', u.first)).toMatchObject({
      ok: false,
      error: { field: 'password', code: 'too_short' },
    })
    expect((await svc.login({ email: 'pw1@x.test', password: PW })).ok).toBe(true) // unchanged
    const events = (await forUser(t.db, u.id).audit.list(20)).map((e) => e.event)
    expect(events).toContain('password_change_failed')
  })

  it('switches the password, keeps this session, and ends every other one', async () => {
    const u = await user('pw2@x.test')
    const other = await svc.sessions.create(u.id, 'Stolen laptop')
    expect(await svc.changePassword(u.id, PW, PW2, u.first)).toEqual({ ok: true, value: true })
    expect(await svc.sessions.validate(u.first)).not.toBeNull()
    expect(await svc.sessions.validate(other)).toBeNull()
    expect((await svc.login({ email: 'pw2@x.test', password: PW })).ok).toBe(false)
    expect((await svc.login({ email: 'pw2@x.test', password: PW2 })).ok).toBe(true)
    expect((await forUser(t.db, u.id).audit.list(20)).map((e) => e.event)).toContain(
      'password_changed',
    )
  })
})

describe('two-step setup cannot be hijacked', () => {
  it('starting a new enrolment is refused while it is on, so the factor cannot be swapped without a code', async () => {
    const u = await user('mfa@x.test')
    const mfa = mfaService({
      db: t.db,
      ring: { current: { version: 1, key: randomBytes(32) } },
      sessionSecret: 's'.repeat(40),
      now: () => clock,
    })
    const b = await mfa.begin(u.id, 'mfa@x.test')
    expect((await mfa.confirm(u.id, totpAt(b.secret, clock.getTime()))).ok).toBe(true)
    await expect(mfa.begin(u.id, 'mfa@x.test')).rejects.toThrow('mfa_already_enabled')
    expect(await mfa.isEnabled(u.id)).toBe(true)
  })
})
