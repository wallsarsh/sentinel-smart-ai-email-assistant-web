import { and, eq, ne } from 'drizzle-orm'
import { draftRefs, messages } from '../db/schema'
import type { Scope } from './scope'

export type DraftRow = typeof draftRefs.$inferSelect

export const draftsRepo = (s: Scope) => ({
  /** The live (not deleted) draft for a message, if any. One per message. */
  async forMessage(messageId: string): Promise<DraftRow | null> {
    const [r] = await s.db
      .select()
      .from(draftRefs)
      .where(
        and(
          eq(draftRefs.userId, s.userId),
          eq(draftRefs.messageId, messageId),
          ne(draftRefs.status, 'deleted'),
        ),
      )
    return r ?? null
  },

  /** Inserts or updates by (user, idempotency key). Written before any provider call so a crash cannot lose the key. */
  async upsert(v: Omit<typeof draftRefs.$inferInsert, 'userId'>): Promise<DraftRow> {
    const own = await s.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.userId, s.userId), eq(messages.id, v.messageId)))
    if (!own.length) throw new Error('forbidden')
    const [r] = await s.db
      .insert(draftRefs)
      .values({ ...v, userId: s.userId })
      .onConflictDoUpdate({
        target: [draftRefs.userId, draftRefs.idempotencyKey],
        set: {
          tone: v.tone,
          intent: v.intent,
          status: v.status,
          bodyPreview: v.bodyPreview,
          providerDraftId: v.providerDraftId ?? null,
          updatedAt: v.updatedAt ?? new Date(),
        },
      })
      .returning()
    return r!
  },

  async setStatus(
    id: string,
    status: 'local' | 'saved' | 'deleted',
    providerDraftId?: string | null,
  ) {
    await s.db
      .update(draftRefs)
      .set({
        status,
        updatedAt: new Date(),
        ...(providerDraftId === undefined ? {} : { providerDraftId }),
      })
      .where(and(eq(draftRefs.userId, s.userId), eq(draftRefs.id, id)))
  },
})
