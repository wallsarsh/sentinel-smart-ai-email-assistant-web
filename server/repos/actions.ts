import { and, desc, eq, ne } from 'drizzle-orm'
import { actionItems, messages } from '../db/schema'
import type { ActionRow } from '../../shared/actions'
import type { Scope } from './scope'

export const actionsRepo = (s: Scope) => ({
  /** Action items with their source message's sender and subject (done ones limited to the latest 50). */
  async list(): Promise<ActionRow[]> {
    const cols = {
      id: actionItems.id,
      messageId: actionItems.messageId,
      text: actionItems.itemText,
      dueAt: actionItems.dueAt,
      dueText: actionItems.dueText,
      status: actionItems.status,
      snoozedUntil: actionItems.snoozedUntil,
      subject: messages.subject,
      fromName: messages.fromName,
      fromAddress: messages.fromAddress,
    }
    const base = () =>
      s.db
        .select(cols)
        .from(actionItems)
        .innerJoin(messages, eq(messages.id, actionItems.messageId))
    const mine = eq(actionItems.userId, s.userId)
    const live = await base()
      .where(and(mine, ne(actionItems.status, 'done')))
      .orderBy(actionItems.dueAt)
    const done = await base()
      .where(and(mine, eq(actionItems.status, 'done')))
      .orderBy(desc(actionItems.createdAt))
      .limit(50)
    return [...live, ...done]
  },

  async setStatus(id: string, status: 'open' | 'done'): Promise<boolean> {
    const r = await s.db
      .update(actionItems)
      .set({ status, snoozedUntil: null })
      .where(and(eq(actionItems.userId, s.userId), eq(actionItems.id, id)))
      .returning({ id: actionItems.id })
    return r.length > 0
  },

  async snooze(id: string, until: Date): Promise<boolean> {
    const r = await s.db
      .update(actionItems)
      .set({ status: 'snoozed', snoozedUntil: until })
      .where(and(eq(actionItems.userId, s.userId), eq(actionItems.id, id)))
      .returning({ id: actionItems.id })
    return r.length > 0
  },
})
