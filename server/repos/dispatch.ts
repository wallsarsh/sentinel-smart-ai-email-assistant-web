import { and, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm'
import { sendAuthorizations, sendRecords, sessions } from '../db/schema'
import type { Scope } from './scope'

export type AuthRow = typeof sendAuthorizations.$inferSelect
export type RecordRow = typeof sendRecords.$inferSelect
export type SendStatus = RecordRow['status']

/** Authorizations and send records for one user. Metadata only; message bodies never pass through here. */
export const sendRepo = (s: Scope) => ({
  async createAuthorization(
    v: Omit<typeof sendAuthorizations.$inferInsert, 'userId' | 'state' | 'redeemedAt'>,
  ) {
    await s.db.insert(sendAuthorizations).values({ ...v, userId: s.userId })
  },

  async getAuthorization(nonceHash: string): Promise<AuthRow | null> {
    const [r] = await s.db
      .select()
      .from(sendAuthorizations)
      .where(
        and(eq(sendAuthorizations.userId, s.userId), eq(sendAuthorizations.nonceHash, nonceHash)),
      )
    return r ?? null
  },

  /** Marks an issued authorization revoked. False when it was already used, revoked or unknown. */
  async revokeAuthorization(nonceHash: string): Promise<boolean> {
    const r = await s.db
      .update(sendAuthorizations)
      .set({ state: 'revoked' })
      .where(
        and(
          eq(sendAuthorizations.userId, s.userId),
          eq(sendAuthorizations.nonceHash, nonceHash),
          eq(sendAuthorizations.state, 'issued'),
        ),
      )
      .returning({ h: sendAuthorizations.nonceHash })
    return r.length > 0
  },

  /** Atomically moves issued → used if still valid. Exactly one concurrent caller gets true. */
  async claim(nonceHash: string, now: Date): Promise<boolean> {
    const r = await s.db
      .update(sendAuthorizations)
      .set({ state: 'used', redeemedAt: now })
      .where(
        and(
          eq(sendAuthorizations.userId, s.userId),
          eq(sendAuthorizations.nonceHash, nonceHash),
          eq(sendAuthorizations.state, 'issued'),
          gt(sendAuthorizations.expiresAt, now),
        ),
      )
      .returning({ h: sendAuthorizations.nonceHash })
    return r.length > 0
  },

  async linkRecord(nonceHash: string, recordId: string) {
    await s.db
      .update(sendAuthorizations)
      .set({ recordId })
      .where(
        and(eq(sendAuthorizations.userId, s.userId), eq(sendAuthorizations.nonceHash, nonceHash)),
      )
  },

  async endAuthorization(nonceHash: string, reason: string) {
    await s.db
      .update(sendAuthorizations)
      .set({ endedReason: reason })
      .where(
        and(eq(sendAuthorizations.userId, s.userId), eq(sendAuthorizations.nonceHash, nonceHash)),
      )
  },

  /** Revokes every pending authorization (for example after a password change). */
  async revokeAllPending(): Promise<number> {
    const r = await s.db
      .update(sendAuthorizations)
      .set({ state: 'revoked' })
      .where(and(eq(sendAuthorizations.userId, s.userId), eq(sendAuthorizations.state, 'issued')))
      .returning({ h: sendAuthorizations.nonceHash })
    return r.length
  },

  async sessionAlive(sessionId: string, now: Date): Promise<boolean> {
    const [r] = await s.db
      .select({ revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, s.userId), eq(sessions.id, sessionId)))
    return !!r && r.revokedAt === null && r.expiresAt > now
  },

  /** Sends that count against the daily limit: anything that reached or may have reached the provider. */
  async sentSince(since: Date): Promise<number> {
    const [r] = await s.db
      .select({ n: sql<number>`count(*)::int` })
      .from(sendRecords)
      .where(
        and(
          eq(sendRecords.userId, s.userId),
          gte(sendRecords.approvedAt, since),
          inArray(sendRecords.status, ['submitting', 'sent', 'unknown']),
        ),
      )
    return r?.n ?? 0
  },

  async beginRecord(
    v: Omit<typeof sendRecords.$inferInsert, 'userId' | 'status'>,
  ): Promise<RecordRow> {
    const [r] = await s.db
      .insert(sendRecords)
      .values({ ...v, userId: s.userId, status: 'pending' })
      .returning()
    return r!
  },

  async getRecord(id: string): Promise<RecordRow | null> {
    const [r] = await s.db
      .select()
      .from(sendRecords)
      .where(and(eq(sendRecords.userId, s.userId), eq(sendRecords.id, id)))
    return r ?? null
  },

  /** Moves a record along its state machine; only the listed [from] states may move. Returns whether it moved. */
  async transition(
    id: string,
    from: SendStatus[],
    to: SendStatus,
    extra: { sentAt?: Date; errorCode?: string | null } = {},
  ): Promise<boolean> {
    const r = await s.db
      .update(sendRecords)
      .set({ status: to, ...extra })
      .where(
        and(
          eq(sendRecords.userId, s.userId),
          eq(sendRecords.id, id),
          inArray(sendRecords.status, from),
        ),
      )
      .returning({ id: sendRecords.id })
    return r.length > 0
  },

  async recentRecords(limit = 50): Promise<RecordRow[]> {
    return s.db
      .select()
      .from(sendRecords)
      .where(eq(sendRecords.userId, s.userId))
      .orderBy(sql`${sendRecords.approvedAt} desc`)
      .limit(limit)
  },
})

/** Operator-side view for the scheduler: due authorizations of any user. Only the send module may call it. */
export const sendScheduleAdmin = (db: Scope['db']) => ({
  async due(now: Date, limit = 20): Promise<{ nonceHash: string; userId: string }[]> {
    return db
      .select({ nonceHash: sendAuthorizations.nonceHash, userId: sendAuthorizations.userId })
      .from(sendAuthorizations)
      .where(and(eq(sendAuthorizations.state, 'issued'), lte(sendAuthorizations.releaseAt, now)))
      .limit(limit)
  },
  /** Deletes ended authorizations older than [before] (their sealed content is deleted by the gate). */
  async purgeOlderThan(before: Date): Promise<string[]> {
    const rows = await db
      .delete(sendAuthorizations)
      .where(
        and(
          inArray(sendAuthorizations.state, ['used', 'revoked']),
          lte(sendAuthorizations.issuedAt, before),
        ),
      )
      .returning({ h: sendAuthorizations.nonceHash })
    return rows.map((r) => r.h)
  },
  async expired(now: Date): Promise<{ nonceHash: string; userId: string }[]> {
    return db
      .select({ nonceHash: sendAuthorizations.nonceHash, userId: sendAuthorizations.userId })
      .from(sendAuthorizations)
      .where(and(eq(sendAuthorizations.state, 'issued'), lte(sendAuthorizations.expiresAt, now)))
  },
})
