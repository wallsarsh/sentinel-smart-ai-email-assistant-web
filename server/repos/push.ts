import { and, eq, lt } from 'drizzle-orm'
import { pushSubscriptions } from '../db/schema'
import type { Scope } from './scope'

export type SubscriptionRow = typeof pushSubscriptions.$inferSelect

export const pushRepo = (s: Scope) => ({
  list: (): Promise<SubscriptionRow[]> =>
    s.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, s.userId)),

  /** One row per browser endpoint; resubscribing refreshes its keys and clears any failure mark. */
  async upsert(v: {
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string
  }): Promise<SubscriptionRow> {
    const [r] = await s.db
      .insert(pushSubscriptions)
      .values({ ...v, userId: s.userId })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: v.p256dh,
          auth: v.auth,
          userAgent: v.userAgent,
          userId: s.userId,
          failedAt: null,
        },
      })
      .returning()
    return r!
  },

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    return (
      (
        await s.db
          .delete(pushSubscriptions)
          .where(
            and(eq(pushSubscriptions.userId, s.userId), eq(pushSubscriptions.endpoint, endpoint)),
          )
          .returning({ id: pushSubscriptions.id })
      ).length > 0
    )
  },

  async removeById(id: string): Promise<boolean> {
    return (
      (
        await s.db
          .delete(pushSubscriptions)
          .where(and(eq(pushSubscriptions.userId, s.userId), eq(pushSubscriptions.id, id)))
          .returning({ id: pushSubscriptions.id })
      ).length > 0
    )
  },

  async markFailed(id: string, at: Date) {
    await s.db
      .update(pushSubscriptions)
      .set({ failedAt: at })
      .where(and(eq(pushSubscriptions.userId, s.userId), eq(pushSubscriptions.id, id)))
  },

  /** Drops subscriptions that have been failing since before [before]. */
  async removeFailedBefore(before: Date): Promise<number> {
    return (
      await s.db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, s.userId), lt(pushSubscriptions.failedAt, before)))
        .returning({ id: pushSubscriptions.id })
    ).length
  },
})
