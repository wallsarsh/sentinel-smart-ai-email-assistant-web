import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { Db } from '../db/client'
import { authRepo } from '../repos/auth'
import { lockoutRepo } from '../repos/audit'
import { lockDuration, type Auditor } from '../audit/audit'
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../security/password'
import { sessionService, type Clock } from './sessions'

export type Mailer = { sendPasswordReset(to: string, link: string): Promise<void> }

export type AuthDeps = { db: Db; mailer: Mailer; baseUrl: string; now?: Clock; auditor?: Auditor }

const RESET_TTL_MS = 60 * 60 * 1000
const invalid = (): AppFailure => ({ kind: 'auth', problem: 'invalid_credentials' })
// A fixed hash to verify against when the user does not exist, so timing does not reveal accounts.
let dummy: Promise<string> | undefined
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-for-timing'))

export function authService(d: AuthDeps) {
  const now = d.now ?? (() => new Date())
  const repo = authRepo(d.db)
  const lockout = lockoutRepo(d.db)
  const sessions = sessionService(d.db, now)

  return {
    sessions,

    async signup(input: {
      email: string
      password: string
      timezone?: string
      userAgent?: string
    }): Promise<Result<{ userId: string; token: string }, AppFailure>> {
      const email = input.email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return err({ kind: 'validation', field: 'email', code: 'invalid' })
      const problem = checkPasswordPolicy(input.password, email)
      if (problem) return err({ kind: 'validation', field: 'password', code: problem })
      if (await repo.userByEmail(email))
        return err({ kind: 'validation', field: 'email', code: 'taken' })
      const user = await repo.createUser({
        email,
        passwordHash: await hashPassword(input.password),
        timezone: input.timezone ?? 'UTC',
      })
      await d.auditor?.record(user.id, 'signup')
      return ok({ userId: user.id, token: await sessions.create(user.id, input.userAgent) })
    },

    /** Checks email and password only; no session is created. */
    async verifyCredentials(
      email: string,
      password: string,
      ip = '',
    ): Promise<Result<{ userId: string }, AppFailure>> {
      const user = await repo.userByEmail(email.trim())
      const good = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password)
      if (!user) return err(invalid())
      const t = now()
      const state = await lockout.state(user.id)
      // A locked account answers exactly like a wrong password, so lockout does not reveal accounts.
      if (state?.lockedUntil && state.lockedUntil > t) {
        await d.auditor?.record(user.id, 'login_locked', '', ip)
        return err(invalid())
      }
      if (!good) {
        const failed = (state?.failed ?? 0) + 1
        const wait = lockDuration(failed)
        await lockout.set(user.id, failed, wait ? new Date(t.getTime() + wait) : null)
        await d.auditor?.record(user.id, 'login_failed', `n=${failed}`, ip)
        return err(invalid())
      }
      if (state && (state.failed > 0 || state.lockedUntil)) await lockout.set(user.id, 0, null)
      await d.auditor?.record(user.id, 'login_success', '', ip)
      return ok({ userId: user.id })
    },

    /**
     * Changes the password after checking the current one. Every other session
     * ends (the one making the change stays), so a stolen session cannot outlive it.
     */
    async changePassword(
      userId: string,
      current: string,
      next: string,
      currentToken?: string,
    ): Promise<Result<true, AppFailure>> {
      const user = await repo.userById(userId)
      if (!user) return err(invalid())
      if (!(await verifyPassword(user.passwordHash, current))) {
        await d.auditor?.record(userId, 'password_change_failed')
        return err(invalid())
      }
      const problem = checkPasswordPolicy(next, user.email)
      if (problem) return err({ kind: 'validation', field: 'password', code: problem })
      await repo.setPassword(userId, await hashPassword(next))
      await sessions.revokeAll(userId, currentToken)
      await d.auditor?.record(userId, 'password_changed')
      return ok(true)
    },

    startSession: (userId: string, userAgent?: string) => sessions.create(userId, userAgent),

    async login(input: {
      email: string
      password: string
      userAgent?: string
      ip?: string
    }): Promise<Result<{ userId: string; token: string }, AppFailure>> {
      const r = await this.verifyCredentials(input.email, input.password, input.ip)
      if (!r.ok) return r
      return ok({
        userId: r.value.userId,
        token: await sessions.create(r.value.userId, input.userAgent),
      })
    },

    /** Always succeeds from the caller's point of view (no account enumeration). */
    async requestPasswordReset(email: string): Promise<void> {
      const user = await repo.userByEmail(email.trim())
      if (!user) return
      const token = randomBytes(32).toString('base64url')
      await repo.createReset({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(now().getTime() + RESET_TTL_MS),
      })
      await d.auditor?.record(user.id, 'password_reset_requested')
      await d.mailer.sendPasswordReset(user.email, `${d.baseUrl}/reset/confirm?token=${token}`)
    },

    async confirmPasswordReset(
      token: string,
      newPassword: string,
    ): Promise<Result<true, AppFailure>> {
      const row = await repo.consumeReset(createHash('sha256').update(token).digest('hex'), now())
      if (!row) return err({ kind: 'auth', problem: 'invalid_credentials', code: 'reset_invalid' })
      const user = await repo.userById(row.userId)
      const problem = checkPasswordPolicy(newPassword, user!.email)
      if (problem) return err({ kind: 'validation', field: 'password', code: problem })
      await repo.setPassword(row.userId, await hashPassword(newPassword))
      await sessions.revokeAll(row.userId)
      await d.auditor?.record(row.userId, 'password_changed')
      return ok(true)
    },
  }
}
