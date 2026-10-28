import { desc, eq, and, gte } from 'drizzle-orm'
import { auditLog, users } from '../db/schema'
import type { Db } from '../db/client'
import type { Scope } from './scope'

export const auditRepo = (s: Scope) => ({
  async add(event: string, detail = '', ip = '', at?: Date) {
    await s.db
      .insert(auditLog)
      .values({ userId: s.userId, event, detail, ip, ...(at ? { at } : {}) })
  },
  list: (limit = 100) =>
    s.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, s.userId))
      .orderBy(desc(auditLog.at))
      .limit(limit),
  recentCount: async (event: string, since: Date) =>
    (
      await s.db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(eq(auditLog.userId, s.userId), eq(auditLog.event, event), gte(auditLog.at, since)),
        )
    ).length,
})

/** Lockout counters live on the user row; looked up before a user is established. */
export const lockoutRepo = (db: Db) => ({
  async state(userId: string) {
    const [r] = await db
      .select({ failed: users.failedLogins, lockedUntil: users.lockedUntil })
      .from(users)
      .where(eq(users.id, userId))
    return r ?? null
  },
  async set(userId: string, failed: number, lockedUntil: Date | null) {
    await db.update(users).set({ failedLogins: failed, lockedUntil }).where(eq(users.id, userId))
  },
})
