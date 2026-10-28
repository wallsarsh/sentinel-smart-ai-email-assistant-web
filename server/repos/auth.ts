import { and, eq, gt, isNull } from 'drizzle-orm'
import { passwordResets, sessions, users } from '../db/schema'
import type { Db } from '../db/client'

/**
 * Pre-authentication data access (look up by email or token). The only
 * repository that is not bound to a user, because the user is what is being
 * established. It never returns other tenants' data to callers.
 */
export const authRepo = (db: Db) => ({
  /** Every user id; for schedulers that fan work out per user. */
  async allUserIds(): Promise<string[]> {
    return (await db.select({ id: users.id }).from(users)).map((r) => r.id)
  },
  async createUser(v: {
    email: string
    passwordHash: string
    displayName?: string
    timezone?: string
  }) {
    const [row] = await db.insert(users).values(v).returning()
    return row!
  },
  async userByEmail(email: string) {
    const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()))
    return row ?? null
  },
  async userById(id: string) {
    const [row] = await db.select().from(users).where(eq(users.id, id))
    return row ?? null
  },
  async updateProfile(userId: string, patch: { displayName?: string; timezone?: string }) {
    await db.update(users).set(patch).where(eq(users.id, userId))
  },
  async setPassword(userId: string, passwordHash: string) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  },

  async createSession(v: {
    id: string
    userId: string
    expiresAt: Date
    userAgent: string
    createdAt: Date
    lastSeenAt: Date
  }) {
    await db.insert(sessions).values(v)
  },
  async sessionWithUser(id: string, now: Date) {
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    return row ?? null
  },
  async touchSession(id: string, now: Date, expiresAt: Date) {
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id))
  },
  async revokeSession(id: string, now: Date) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, id))
  },
  async revokeAllSessions(userId: string, now: Date, exceptId?: string) {
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    for (const r of rows)
      if (r.id !== exceptId)
        await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, r.id))
  },

  async createReset(v: { tokenHash: string; userId: string; expiresAt: Date }) {
    await db.insert(passwordResets).values(v)
  },
  async consumeReset(tokenHash: string, now: Date) {
    const rows = await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, now),
        ),
      )
      .returning()
    return rows[0] ?? null
  },
})
