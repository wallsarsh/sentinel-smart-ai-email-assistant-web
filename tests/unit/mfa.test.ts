import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestDb } from '../../server/db/client'
import { authService } from '../../server/auth/service'
import { hasRecentStepUp, mfaService } from '../../server/auth/mfa'
import { base32Decode, base32Encode, totpAt, verifyTotp } from '../../server/security/totp'
import { hashToken } from '../../server/auth/sessions'

let t: Awaited<ReturnType<typeof createTestDb>>
let clock = new Date('2026-10-28T10:00:00Z')
let uid: string
let sessionToken: string
let mfa: ReturnType<typeof mfaService>
const ring = { current: { version: 1, key: randomBytes(32) } }
const PW = 'correct horse battery staple'

beforeAll(async () => {
  t = await createTestDb()
  const auth = authService({
    db: t.db,
    baseUrl: 'https://a.test',
    now: () => clock,
    mailer: { sendPasswordReset: async () => {} },
  })
  const r = await auth.signup({ email: 'm@x.test', password: PW })
  if (!r.ok) throw new Error('signup')
  uid = r.value.userId
  sessionToken = r.value.token
  mfa = mfaService({ db: t.db, ring, sessionSecret: 's'.repeat(40), now: () => clock })
})
afterAll(async () => t.close())

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'))
    expect(totpAt(secret, 59_000, 8)).toBe('94287082')
    expect(totpAt(secret, 1111111109_000, 8)).toBe('07081804')
    expect(totpAt(secret, 20000000000_000, 8)).toBe('65353130')
  })
  it('base32 round trips', () => {
    const b = randomBytes(20)
    expect(base32Decode(base32Encode(b))).toEqual(b)
  })
  it('accepts one step of drift only', () => {
    const s = base32Encode(randomBytes(20))
    const t0 = 1_700_000_000_000
    expect(verifyTotp(s, totpAt(s, t0), t0)).not.toBeNull()
    expect(verifyTotp(s, totpAt(s, t0 - 30_000), t0)).not.toBeNull()
    expect(verifyTotp(s, totpAt(s, t0 - 90_000), t0)).toBeNull()
    expect(verifyTotp(s, '12345', t0)).toBeNull()
  })
})

describe('enrolment and use', () => {
  let secret: string
  let recovery: string[]

  it('is not active until confirmed with a valid code', async () => {
    const b = await mfa.begin(uid, 'm@x.test')
    secret = b.secret
    expect(b.uri).toMatch(/^otpauth:\/\/totp\//)
    expect(await mfa.isEnabled(uid)).toBe(false)
    expect((await mfa.confirm(uid, '000000')).ok).toBe(false)
    const ok = await mfa.confirm(uid, totpAt(secret, clock.getTime()))
    expect(ok.ok).toBe(true)
    recovery = (ok as { value: { recoveryCodes: string[] } }).value.recoveryCodes
    expect(recovery).toHaveLength(10)
    expect(await mfa.isEnabled(uid)).toBe(true)
  })

  it('the secret is stored encrypted, recovery codes hashed', async () => {
    const rows = await t.raw.query<{ ciphertext: string }>('select ciphertext from secrets')
    expect(rows.rows.some((r) => r.ciphertext.includes(secret))).toBe(false)
    const rc = await t.raw.query<{ code_hash: string }>('select code_hash from recovery_codes')
    for (const r of rc.rows) expect(recovery).not.toContain(r.code_hash)
  })

  it('login challenge: signed, expiring, needs a valid factor', async () => {
    const ch = mfa.issueChallenge(uid)
    expect((await mfa.completeLogin(ch, '111111')).ok).toBe(false)
    expect((await mfa.completeLogin(ch + 'x', totpAt(secret, clock.getTime()))).ok).toBe(false)
    expect((await mfa.completeLogin(ch, totpAt(secret, clock.getTime()))).ok).toBe(true)
    clock = new Date(clock.getTime() + 6 * 60_000)
    expect((await mfa.completeLogin(ch, totpAt(secret, clock.getTime()))).ok).toBe(false)
  })

  it('recovery codes work once', async () => {
    const ch = mfa.issueChallenge(uid)
    expect((await mfa.completeLogin(ch, recovery[0]!)).ok).toBe(true)
    expect((await mfa.completeLogin(ch, recovery[0]!)).ok).toBe(false)
    expect((await mfa.completeLogin(ch, recovery[1]!.toUpperCase())).ok).toBe(true)
  })

  it('step-up marks the session and expires', async () => {
    const [row] = await t.db.query.sessions.findMany({
      where: (s, { eq }) => eq(s.id, hashToken(sessionToken)),
    })
    expect(hasRecentStepUp(row!, clock)).toBe(false)
    expect((await mfa.stepUp(uid, row!.id, '999999')).ok).toBe(false)
    expect((await mfa.stepUp(uid, row!.id, totpAt(secret, clock.getTime()))).ok).toBe(true)
    const [after] = await t.db.query.sessions.findMany({ where: (s, { eq }) => eq(s.id, row!.id) })
    expect(hasRecentStepUp(after!, clock)).toBe(true)
    expect(hasRecentStepUp(after!, new Date(clock.getTime() + 11 * 60_000))).toBe(false)
  })

  it('regenerating replaces the codes; disabling needs a factor and clears everything', async () => {
    const fresh = await mfa.regenerateRecoveryCodes(uid, totpAt(secret, clock.getTime()))
    expect(fresh.ok).toBe(true)
    const ch = mfa.issueChallenge(uid)
    expect((await mfa.completeLogin(ch, recovery[2]!)).ok).toBe(false)
    expect((await mfa.disable(uid, '000000')).ok).toBe(false)
    expect((await mfa.disable(uid, totpAt(secret, clock.getTime()))).ok).toBe(true)
    expect(await mfa.isEnabled(uid)).toBe(false)
    expect((await t.raw.query('select 1 from recovery_codes')).rows).toHaveLength(0)
  })
})
