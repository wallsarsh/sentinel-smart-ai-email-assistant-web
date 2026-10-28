import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm'
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
  /** Deletes sessions that expired (or were revoked over a week ago) and used or expired reset tokens. */
  async purgeExpired(now: Date): Promise<{ sessions: number; resets: number }> {
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
    const s = await db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, weekAgo)))
      .returning({ id: sessions.id })
    const r = await db
      .delete(passwordResets)
      .where(or(lt(passwordResets.expiresAt, now), lt(passwordResets.usedAt, weekAgo)))
      .returning({ h: passwordResets.tokenHash })
    return { sessions: s.length, resets: r.length }
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

  /** The user's live sessions, newest activity first. */
  async listSessions(userId: string, now: Date) {
    return db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
      )
      .orderBy(desc(sessions.lastSeenAt))
  },
  /** Revokes one of the user's own sessions by its id; false when it is not theirs or already ended. */
  async revokeOwnSession(userId: string, id: string, now: Date): Promise<boolean> {
    const r = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), eq(sessions.id, id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id })
    return r.length > 0
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
