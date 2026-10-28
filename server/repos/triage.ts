import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { actionItems, messages, triageResults } from '../db/schema'
import type { Scope } from './scope'

export type NewTriage = Omit<typeof triageResults.$inferInsert, 'userId'>
export type NewAction = Pick<typeof actionItems.$inferInsert, 'itemText' | 'dueAt' | 'dueText'>

export const triageRepo = (s: Scope) => ({
  /** Newest messages in processed folders that have no triage result yet. */
  async untriaged(limit = 100): Promise<string[]> {
    const r = await s.db.execute(sql`
      select m.id from messages m
      join folders f on f.id = m.folder_id and f.processed
      left join triage_results t on t.message_id = m.id
      where m.user_id = ${s.userId} and t.message_id is null
      order by m.received_at desc limit ${limit}`)
    return r.rows.map((x) => String(x.id))
  },

  async resultFor(messageId: string) {
    const [r] = await s.db
      .select()
      .from(triageResults)
      .where(and(eq(triageResults.userId, s.userId), eq(triageResults.messageId, messageId)))
    return r ?? null
  },

  async untriagedAmong(ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await s.db
      .select({ id: messages.id })
      .from(messages)
      .leftJoin(triageResults, eq(triageResults.messageId, messages.id))
      .where(
        and(
          eq(messages.userId, s.userId),
          inArray(messages.id, ids),
          isNull(triageResults.messageId),
        ),
      )
    return rows.map((r) => r.id)
  },

  /** Changes fields of an existing result (user corrections). Action items are left alone. */
  async update(
    messageId: string,
    patch: Partial<
      Pick<typeof triageResults.$inferInsert, 'importance' | 'priority' | 'needsReply' | 'source'>
    >,
  ) {
    const r = await s.db
      .update(triageResults)
      .set(patch)
      .where(and(eq(triageResults.userId, s.userId), eq(triageResults.messageId, messageId)))
      .returning({ id: triageResults.messageId })
    return r.length > 0
  },

  /** Writes the result and replaces the message's action items in one transaction. */
  async save(result: NewTriage, actions: NewAction[]) {
    await s.db.transaction(async (tx) => {
      const own = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.userId, s.userId), eq(messages.id, result.messageId)))
      if (!own.length) throw new Error('forbidden')
      await tx
        .insert(triageResults)
        .values({ ...result, userId: s.userId })
        .onConflictDoUpdate({
          target: triageResults.messageId,
          set: {
            category: result.category,
            importance: result.importance,
            urgency: result.urgency,
            priority: result.priority,
            needsReply: result.needsReply,
            summary: result.summary,
            reason: result.reason,
            confidence: result.confidence ?? null,
            source: result.source,
            providerId: result.providerId ?? null,
            model: result.model ?? null,
            promptVersion: result.promptVersion ?? null,
          },
        })
      await tx
        .delete(actionItems)
        .where(
          and(
            eq(actionItems.userId, s.userId),
            eq(actionItems.messageId, result.messageId),
            eq(actionItems.status, 'open'),
          ),
        )
      if (actions.length)
        await tx
          .insert(actionItems)
          .values(actions.map((a) => ({ ...a, userId: s.userId, messageId: result.messageId })))
    })
  },
})
