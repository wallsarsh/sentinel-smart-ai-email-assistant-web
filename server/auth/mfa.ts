import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { newTotpSecret, otpauthUri, verifyTotp } from '../security/totp'
import { secretStoreFor, type KekRing } from '../security/secret-store'
import type { Clock } from './sessions'

const SECRET = 'mfa.totp'
const CHALLENGE_TTL_MS = 5 * 60_000
export const STEP_UP_WINDOW_MS = 10 * 60_000

const hashCode = (c: string) =>
  createHash('sha256').update(c.replace(/[-\s]/g, '').toLowerCase()).digest('hex')
const invalid = (): AppFailure => ({
  kind: 'auth',
  problem: 'invalid_credentials',
  code: 'mfa_invalid',
})

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const h = randomBytes(5).toString('hex')
    return `${h.slice(0, 5)}-${h.slice(5)}`
  })
}

export type MfaDeps = { db: Db; ring: KekRing; sessionSecret: string; now?: Clock }

export function mfaService(d: MfaDeps) {
  const now = d.now ?? (() => new Date())
  const secretsFor = (userId: string) => secretStoreFor(d.db, userId, d.ring)

  /** Verifies a TOTP code or a recovery code (which is then burned). */
  async function verifyFactor(userId: string, code: string): Promise<boolean> {
    const repo = forUser(d.db, userId)
    const row = await repo.mfa.get()
    if (!row?.confirmed) return false
    const trimmed = code.trim()
    if (/^\d{6}$/.test(trimmed)) {
      const secret = await secretsFor(userId).get(SECRET)
      return !!secret && verifyTotp(secret, trimmed, now().getTime()) !== null
    }
    return repo.mfa.consumeRecoveryCode(hashCode(trimmed), now())
  }

  return {
    async isEnabled(userId: string) {
      return !!(await forUser(d.db, userId).mfa.get())?.confirmed
    },

    /** Starts enrolment: a fresh secret (not active until confirmed). */
    async begin(userId: string, accountEmail: string) {
      const secret = newTotpSecret()
      await secretsFor(userId).put(SECRET, secret)
      await forUser(d.db, userId).mfa.upsert(SECRET)
      return { secret, uri: otpauthUri(secret, accountEmail) }
    },

    /** Confirms with a first code; returns the recovery codes, shown once. */
    async confirm(
      userId: string,
      code: string,
    ): Promise<Result<{ recoveryCodes: string[] }, AppFailure>> {
      const repo = forUser(d.db, userId)
      const row = await repo.mfa.get()
      const secret = row ? await secretsFor(userId).get(SECRET) : null
      if (!row || !secret || verifyTotp(secret, code.trim(), now().getTime()) === null)
        return err(invalid())
      await repo.mfa.confirm()
      const codes = newRecoveryCodes()
      await repo.mfa.replaceRecoveryCodes(codes.map(hashCode))
      return ok({ recoveryCodes: codes })
    },

    async disable(userId: string, code: string): Promise<Result<true, AppFailure>> {
      if (!(await verifyFactor(userId, code))) return err(invalid())
      await forUser(d.db, userId).mfa.remove()
      await secretsFor(userId).delete(SECRET)
      return ok(true)
    },

    async regenerateRecoveryCodes(
      userId: string,
      code: string,
    ): Promise<Result<string[], AppFailure>> {
      if (!(await verifyFactor(userId, code))) return err(invalid())
      const codes = newRecoveryCodes()
      await forUser(d.db, userId).mfa.replaceRecoveryCodes(codes.map(hashCode))
      return ok(codes)
    },

    /** Login second factor: a stateless, signed, five-minute challenge bound to the user. */
    issueChallenge(userId: string): string {
      const body = `${userId}.${now().getTime() + CHALLENGE_TTL_MS}`
      const sig = createHmac('sha256', d.sessionSecret).update(`mfa:${body}`).digest('base64url')
      return `${Buffer.from(body).toString('base64url')}.${sig}`
    },

    async completeLogin(
      challenge: string,
      code: string,
    ): Promise<Result<{ userId: string }, AppFailure>> {
      const [b64, sig] = challenge.split('.')
      if (!b64 || !sig) return err(invalid())
      const body = Buffer.from(b64, 'base64url').toString()
      const expect = createHmac('sha256', d.sessionSecret).update(`mfa:${body}`).digest('base64url')
      const a = Buffer.from(sig)
      const e = Buffer.from(expect)
      if (a.length !== e.length || !timingSafeEqual(a, e)) return err(invalid())
      const [userId, exp] = body.split('.')
      if (!userId || Number(exp) < now().getTime()) return err(invalid())
      return (await verifyFactor(userId, code)) ? ok({ userId }) : err(invalid())
    },

    /** Marks the session as freshly verified for sensitive actions. */
    async stepUp(
      userId: string,
      sessionId: string,
      code: string,
    ): Promise<Result<true, AppFailure>> {
      if (!(await verifyFactor(userId, code))) return err(invalid())
      await forUser(d.db, userId).mfa.markStepUp(sessionId, now())
      return ok(true)
    },
  }
}

/** True when the session was step-up verified recently. */
export function hasRecentStepUp(
  session: { stepUpAt: Date | null },
  now: Date,
  windowMs = STEP_UP_WINDOW_MS,
): boolean {
  return !!session.stepUpAt && now.getTime() - session.stepUpAt.getTime() <= windowMs
}
