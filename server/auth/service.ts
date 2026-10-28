import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { Db } from '../db/client'
import { authRepo } from '../repos/auth'
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../security/password'
import { sessionService, type Clock } from './sessions'

export type Mailer = { sendPasswordReset(to: string, link: string): Promise<void> }

export type AuthDeps = { db: Db; mailer: Mailer; baseUrl: string; now?: Clock }

const RESET_TTL_MS = 60 * 60 * 1000
const invalid = (): AppFailure => ({ kind: 'auth', problem: 'invalid_credentials' })
// A fixed hash to verify against when the user does not exist, so timing does not reveal accounts.
let dummy: Promise<string> | undefined
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-for-timing'))

export function authService(d: AuthDeps) {
  const now = d.now ?? (() => new Date())
  const repo = authRepo(d.db)
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
      return ok({ userId: user.id, token: await sessions.create(user.id, input.userAgent) })
    },

    /** Checks email and password only; no session is created. */
    async verifyCredentials(
      email: string,
      password: string,
    ): Promise<Result<{ userId: string }, AppFailure>> {
      const user = await repo.userByEmail(email.trim())
      const good = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password)
      return !user || !good ? err(invalid()) : ok({ userId: user.id })
    },

    startSession: (userId: string, userAgent?: string) => sessions.create(userId, userAgent),

    async login(input: {
      email: string
      password: string
      userAgent?: string
    }): Promise<Result<{ userId: string; token: string }, AppFailure>> {
      const user = await repo.userByEmail(input.email.trim())
      const good = await verifyPassword(user?.passwordHash ?? (await dummyHash()), input.password)
      if (!user || !good) return err(invalid())
      return ok({ userId: user.id, token: await sessions.create(user.id, input.userAgent) })
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
      await d.mailer.sendPasswordReset(user.email, `${d.baseUrl}/reset-password?token=${token}`)
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
      return ok(true)
    },
  }
}
