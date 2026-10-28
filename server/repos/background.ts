import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { bgRuns, messages, notified, triageResults } from '../db/schema'
import type { Scope } from './scope'

export type RunRow = typeof bgRuns.$inferSelect

/** Background run records (diagnostics) and the once-per-key notification ledger. */
export const backgroundRepo = (s: Scope) => ({
  async startRun(
    trigger: string,
    accountId: string | null = null,
    at = new Date(),
  ): Promise<string> {
    const [r] = await s.db
      .insert(bgRuns)
      .values({ userId: s.userId, trigger, accountId, startedAt: at })
      .returning({ id: bgRuns.id })
    return r!.id
  },

  async finishRun(
    id: string,
    v: { outcome: string; newMessages: number; triaged: number; errorCode?: string | null },
    at = new Date(),
  ) {
    await s.db
      .update(bgRuns)
      .set({
        endedAt: at,
        outcome: v.outcome,
        newMessages: v.newMessages,
        triaged: v.triaged,
        errorCode: v.errorCode ?? null,
      })
      .where(and(eq(bgRuns.userId, s.userId), eq(bgRuns.id, id)))
  },

  recentRuns: (limit = 20): Promise<RunRow[]> =>
    s.db
      .select()
      .from(bgRuns)
      .where(eq(bgRuns.userId, s.userId))
      .orderBy(desc(bgRuns.startedAt))
      .limit(limit),

  async deleteRunsBefore(before: Date): Promise<number> {
    return (
      await s.db
        .delete(bgRuns)
        .where(and(eq(bgRuns.userId, s.userId), lt(bgRuns.startedAt, before)))
        .returning({ id: bgRuns.id })
    ).length
  },

  /** Claims a notification key; true only the first time, so a message notifies once even across runs and workers. */
  async claimNotification(key: string): Promise<boolean> {
    const r = await s.db
      .insert(notified)
      .values({ userId: s.userId, key })
      .onConflictDoNothing()
      .returning({ k: notified.key })
    return r.length > 0
  },

  /** Unread, triaged mail received since [since], newest first (inputs to the notification rules). */
  async notifyCandidates(since: Date, limit = 200) {
    return s.db
      .select({
        id: messages.id,
        accountId: messages.accountId,
        fromAddress: messages.fromAddress,
        receivedAt: messages.receivedAt,
        isRead: messages.isRead,
        priority: triageResults.priority,
        needsReply: triageResults.needsReply,
      })
      .from(messages)
      .innerJoin(triageResults, eq(triageResults.messageId, messages.id))
      .where(
        and(
          eq(messages.userId, s.userId),
          eq(messages.isRead, false),
          gte(messages.receivedAt, since),
        ),
      )
      .orderBy(desc(messages.receivedAt))
      .limit(limit)
  },

  /** Gives a claimed key back so a failed attempt can be retried. */
  async releaseNotification(key: string): Promise<void> {
    await s.db.delete(notified).where(and(eq(notified.userId, s.userId), eq(notified.key, key)))
  },

  async notifiedSince(since: Date): Promise<number> {
    return (
      await s.db
        .select({ k: notified.key })
        .from(notified)
        .where(and(eq(notified.userId, s.userId), gte(notified.at, since)))
    ).length
  },
})
