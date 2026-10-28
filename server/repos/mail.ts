import { and, desc, eq, inArray } from 'drizzle-orm'
import { accounts, folders, messages, threads } from '../db/schema'
import type { Scope } from './scope'

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
