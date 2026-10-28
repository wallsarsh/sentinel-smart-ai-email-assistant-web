import { createHash, randomBytes } from 'node:crypto'
import type { Db } from '../db/client'
import { authRepo } from '../repos/auth'

export const SESSION_IDLE_MS = 14 * 24 * 3600 * 1000
export const SESSION_ABSOLUTE_MS = 30 * 24 * 3600 * 1000

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

export type Clock = () => Date

/** Session tokens are random and stored only as a hash; rotation replaces the token. */
export function sessionService(db: Db, now: Clock = () => new Date()) {
  const repo = authRepo(db)
  return {
    async create(userId: string, userAgent = '') {
      const token = newToken()
      const t = now()
      await repo.createSession({
        id: hashToken(token),
        userId,
        userAgent: userAgent.slice(0, 200),
        createdAt: t,
        lastSeenAt: t,
        expiresAt: new Date(t.getTime() + SESSION_IDLE_MS),
      })
      return token
    },

    /** The user and session for a cookie value, or null. Slides the idle expiry. */
    async validate(token: string | undefined) {
      if (!token) return null
      const id = hashToken(token)
      const t = now()
      const row = await repo.sessionWithUser(id, t)
      if (!row) return null
      if (t.getTime() - row.session.createdAt.getTime() > SESSION_ABSOLUTE_MS) {
        await repo.revokeSession(id, t)
        return null
      }
      await repo.touchSession(id, t, new Date(t.getTime() + SESSION_IDLE_MS))
      return { user: row.user, session: row.session }
    },

    /** New token for the same user; the old one stops working (fixation defence). */
    async rotate(token: string) {
      const cur = await this.validate(token)
      if (!cur) return null
      await repo.revokeSession(hashToken(token), now())
      return this.create(cur.user.id, cur.session.userAgent)
    },

    async revoke(token: string) {
      await repo.revokeSession(hashToken(token), now())
    },
    /**
     * The user's live sessions as the settings page shows them. The handle is
     * a prefix of the stored hash: enough to pick one to revoke, useless as a credential.
     */
    async list(userId: string, currentToken?: string) {
      const cur = currentToken ? hashToken(currentToken) : null
      return (await repo.listSessions(userId, now())).map((s) => ({
        handle: s.id.slice(0, 16),
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === cur,
      }))
    },
    /** Ends one of the user's own sessions; it stops working immediately. False when not found. */
    async revokeByHandle(userId: string, handle: string) {
      if (!/^[0-9a-f]{16}$/.test(handle)) return false
      const match = (await repo.listSessions(userId, now())).find((s) => s.id.startsWith(handle))
      return match ? repo.revokeOwnSession(userId, match.id, now()) : false
    },
    revokeAll: (userId: string, exceptToken?: string) =>
      repo.revokeAllSessions(userId, now(), exceptToken ? hashToken(exceptToken) : undefined),
  }
}

export const SESSION_COOKIE = 'sentinel_session'
export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: SESSION_IDLE_MS / 1000,
  }
}
