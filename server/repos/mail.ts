import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { accounts, actionItems, folders, messages, threads } from '../db/schema'
import type { Scope } from './scope'

export type MessageRow = typeof messages.$inferSelect
export type NewMessage = Omit<typeof messages.$inferInsert, 'userId' | 'id'>
export type NewFolder = Omit<typeof folders.$inferInsert, 'userId' | 'id'>

/** An account id is only valid for this user; checked before any child write. */
async function ownsAccount(s: Scope, accountId: string): Promise<boolean> {
  const [a] = await s.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, s.userId), eq(accounts.id, accountId)))
  return !!a
}

export const mailRepo = (s: Scope) => ({
  /**
   * Retention: deletes local copies of messages received before [cutoff],
   * except mail with an open or snoozed action item. Triage results and
   * action items of deleted mail go with them. The mailbox is not touched.
   */
  async deleteReceivedBeforeKeepingOpenTasks(cutoff: Date): Promise<number> {
    const rows = await s.db
      .delete(messages)
      .where(
        and(
          eq(messages.userId, s.userId),
          lt(messages.receivedAt, cutoff),
          sql`not exists (select 1 from ${actionItems} a where a.message_id = ${messages.id} and a.status in ('open','snoozed'))`,
        ),
      )
      .returning({ id: messages.id })
    return rows.length
  },

  async upsertFolders(accountId: string, list: Omit<NewFolder, 'accountId'>[]) {
    if (!(await ownsAccount(s, accountId))) throw new Error('forbidden')
    for (const f of list) {
      await s.db
        .insert(folders)
        .values({ ...f, accountId, userId: s.userId })
        .onConflictDoUpdate({
          target: [folders.accountId, folders.providerId],
          set: { name: f.name, role: f.role },
        })
    }
  },

  /** Chooses which folders Sentinel reads: exactly [providerIds] are processed. */
  async setProcessed(accountId: string, providerIds: string[]) {
    if (!(await ownsAccount(s, accountId))) throw new Error('forbidden')
    const where = and(eq(folders.userId, s.userId), eq(folders.accountId, accountId))
    await s.db.update(folders).set({ processed: false }).where(where)
    if (providerIds.length)
      await s.db
        .update(folders)
        .set({ processed: true })
        .where(and(where, inArray(folders.providerId, providerIds)))
  },

  listFolders: (accountId: string) =>
    s.db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, s.userId), eq(folders.accountId, accountId))),

  async upsertThread(
    accountId: string,
    providerThreadId: string,
    subject: string,
    lastMessageAt: Date,
  ) {
    if (!(await ownsAccount(s, accountId))) throw new Error('forbidden')
    const [row] = await s.db
      .insert(threads)
      .values({ userId: s.userId, accountId, providerThreadId, subject, lastMessageAt })
      .onConflictDoUpdate({
        target: [threads.accountId, threads.providerThreadId],
        set: { subject, lastMessageAt },
      })
      .returning()
    return row!
  },

  async upsertMessages(list: NewMessage[]) {
    for (const m of list) {
      if (!(await ownsAccount(s, m.accountId))) throw new Error('forbidden')
      await s.db
        .insert(messages)
        .values({ ...m, userId: s.userId })
        .onConflictDoUpdate({
          target: [messages.accountId, messages.providerMessageId],
          set: { isRead: m.isRead, subject: m.subject, snippet: m.snippet },
        })
    }
  },

  async getMessage(id: string) {
    const [row] = await s.db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, s.userId), eq(messages.id, id)))
    return row ?? null
  },

  async threadProviderId(threadId: string): Promise<string | null> {
    const [r] = await s.db
      .select({ id: threads.providerThreadId })
      .from(threads)
      .where(and(eq(threads.userId, s.userId), eq(threads.id, threadId)))
    return r?.id ?? null
  },

  /** All messages of a thread, oldest first. */
  threadMessages: (threadId: string) =>
    s.db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, s.userId), eq(messages.threadId, threadId)))
      .orderBy(messages.sentAt, messages.id),

  recent: (limit = 50) =>
    s.db
      .select()
      .from(messages)
      .where(eq(messages.userId, s.userId))
      .orderBy(desc(messages.receivedAt))
      .limit(limit),

  async setRead(id: string, isRead: boolean) {
    const rows = await s.db
      .update(messages)
      .set({ isRead })
      .where(and(eq(messages.userId, s.userId), eq(messages.id, id)))
      .returning({ id: messages.id })
    return rows.length > 0
  },

  async deleteByProviderIds(accountId: string, providerIds: string[]) {
    if (providerIds.length === 0) return 0
    const rows = await s.db
      .delete(messages)
      .where(
        and(
          eq(messages.userId, s.userId),
          eq(messages.accountId, accountId),
          inArray(messages.providerMessageId, providerIds),
        ),
      )
      .returning({ id: messages.id })
    return rows.length
  },
})
