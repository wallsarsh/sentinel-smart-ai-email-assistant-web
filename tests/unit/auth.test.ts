import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { authService, type Mailer } from '../../server/auth/service'
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, hashToken } from '../../server/auth/sessions'
import { sessions as sessionsTable } from '../../server/db/schema'
import { checkPasswordPolicy } from '../../server/security/password'

let t: Awaited<ReturnType<typeof createTestDb>>
let clock = new Date('2026-10-28T10:00:00Z')
const mails: { to: string; link: string }[] = []
const mailer: Mailer = { sendPasswordReset: async (to, link) => void mails.push({ to, link }) }
let svc: ReturnType<typeof authService>

beforeAll(async () => {
  t = await createTestDb()
  svc = authService({ db: t.db, mailer, baseUrl: 'https://app.test', now: () => clock })
})
afterAll(async () => t.close())

const PW = 'correct horse battery staple'

describe('password policy', () => {
  it('flags short, common and email-derived passwords', () => {
    expect(checkPasswordPolicy('short', 'a@b.test')).toBe('too_short')
    expect(checkPasswordPolicy('password1234', 'a@b.test')).toBe('too_common')
    expect(checkPasswordPolicy('alexander-is-great', 'alexander@b.test')).toBe('same_as_email')
    expect(checkPasswordPolicy(PW, 'a@b.test')).toBeNull()
  })
})

describe('signup and login', () => {
  it('signs up, stores an argon2id hash and logs in', async () => {
    const r = await svc.signup({ email: 'Ann@Example.test', password: PW })
    expect(r.ok).toBe(true)
    const login = await svc.login({ email: 'ann@example.test', password: PW })
    expect(login.ok).toBe(true)
    const [row] = await t.db.query.users.findMany({
      where: (u, { eq }) => eq(u.email, 'ann@example.test'),
    })
    expect(row!.passwordHash.startsWith('$argon2id$')).toBe(true)
  })

  it('rejects duplicates, bad emails and weak passwords', async () => {
    expect(await svc.signup({ email: 'ann@example.test', password: PW })).toMatchObject({
      ok: false,
      error: { code: 'taken' },
    })
    expect(await svc.signup({ email: 'nope', password: PW })).toMatchObject({
      ok: false,
      error: { field: 'email' },
    })
    expect(await svc.signup({ email: 'x@example.test', password: 'short' })).toMatchObject({
      ok: false,
      error: { code: 'too_short' },
    })
  })

  it('wrong password and unknown user look the same', async () => {
    const a = await svc.login({ email: 'ann@example.test', password: 'wrong password here' })
    const b = await svc.login({ email: 'ghost@example.test', password: 'wrong password here' })
    expect(a).toEqual(b)
    expect(a.ok).toBe(false)
  })
})

describe('sessions', () => {
  it('validates a token, never stores it, and slides the idle expiry', async () => {
    const { value } = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    const stored = await t.db.select().from(sessionsTable)
    expect(stored.some((s) => s.id === value.token)).toBe(false)
    expect(stored.some((s) => s.id === hashToken(value.token))).toBe(true)
    clock = new Date(clock.getTime() + 3600_000)
    const v = await svc.sessions.validate(value.token)
    expect(v?.user.email).toBe('ann@example.test')
    expect(v!.session.expiresAt.getTime()).toBeLessThan(clock.getTime() + SESSION_IDLE_MS + 1)
  })

  it('unknown, revoked, idle-expired and absolute-expired tokens fail', async () => {
    expect(await svc.sessions.validate(undefined)).toBeNull()
    expect(await svc.sessions.validate('garbage')).toBeNull()
    const { value } = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    await svc.sessions.revoke(value.token)
    expect(await svc.sessions.validate(value.token)).toBeNull()

    const idle = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    clock = new Date(clock.getTime() + SESSION_IDLE_MS + 1000)
    expect(await svc.sessions.validate(idle.value.token)).toBeNull()

    const long = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    for (let i = 0; i < 6; i++) {
      clock = new Date(clock.getTime() + 6 * 24 * 3600_000)
      if (clock.getTime() - Date.now() > 0) break
      await svc.sessions.validate(long.value.token)
    }
    clock = new Date(clock.getTime() + SESSION_ABSOLUTE_MS)
    expect(await svc.sessions.validate(long.value.token)).toBeNull()
  })

  it('rotation invalidates the old token (fixation defence)', async () => {
    const { value } = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    const next = await svc.sessions.rotate(value.token)
    expect(next).toBeTruthy()
    expect(next).not.toBe(value.token)
    expect(await svc.sessions.validate(value.token)).toBeNull()
    expect(await svc.sessions.validate(next!)).not.toBeNull()
  })
})

describe('password reset', () => {
  it('emails a one-hour single-use link and revokes sessions', async () => {
    mails.length = 0
    const { value } = (await svc.login({ email: 'ann@example.test', password: PW })) as {
      value: { token: string }
    }
    await svc.requestPasswordReset('ann@example.test')
    expect(mails).toHaveLength(1)
    const token = new URL(mails[0]!.link).searchParams.get('token')!
    const NEW = 'a brand new long passphrase'
    expect((await svc.confirmPasswordReset(token, NEW)).ok).toBe(true)
    expect((await svc.confirmPasswordReset(token, NEW)).ok).toBe(false)
    expect(await svc.sessions.validate(value.token)).toBeNull()
    expect((await svc.login({ email: 'ann@example.test', password: NEW })).ok).toBe(true)
    expect((await svc.login({ email: 'ann@example.test', password: PW })).ok).toBe(false)
  })

  it('does not reveal unknown accounts and expires tokens', async () => {
    mails.length = 0
    await svc.requestPasswordReset('ghost@example.test')
    expect(mails).toHaveLength(0)
    await svc.requestPasswordReset('ann@example.test')
    const token = new URL(mails[0]!.link).searchParams.get('token')!
    clock = new Date(clock.getTime() + 2 * 3600_000)
    expect((await svc.confirmPasswordReset(token, 'yet another long passphrase')).ok).toBe(false)
  })
})
