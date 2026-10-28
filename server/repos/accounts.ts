import { and, eq } from 'drizzle-orm'
import { accounts, imapSettings } from '../db/schema'
import type { Scope } from './scope'

export type NewAccount = Pick<
  typeof accounts.$inferInsert,
  'type' | 'email' | 'displayName' | 'color'
>

export const accountsRepo = (s: Scope) => ({
  list: () => s.db.select().from(accounts).where(eq(accounts.userId, s.userId)),

  async get(id: string) {
    const [row] = await s.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, s.userId), eq(accounts.id, id)))
    return row ?? null
  },

  async create(a: NewAccount) {
    const [row] = await s.db
      .insert(accounts)
      .values({ ...a, userId: s.userId })
      .returning()
    return row!
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        typeof accounts.$inferInsert,
        'displayName' | 'status' | 'aiExcluded' | 'syncCursor' | 'lastSyncAt' | 'color'
      >
    >,
  ) {
    const [row] = await s.db
      .update(accounts)
      .set(patch)
      .where(and(eq(accounts.userId, s.userId), eq(accounts.id, id)))
      .returning()
    return row ?? null
  },

  async getImap(accountId: string) {
    const [row] = await s.db
      .select()
      .from(imapSettings)
      .where(and(eq(imapSettings.userId, s.userId), eq(imapSettings.accountId, accountId)))
    return row ?? null
  },

  async putImap(
    accountId: string,
    v: Omit<typeof imapSettings.$inferInsert, 'userId' | 'accountId'>,
  ) {
    if (!(await this.get(accountId))) throw new Error('forbidden')
    await s.db
      .insert(imapSettings)
      .values({ ...v, accountId, userId: s.userId })
      .onConflictDoUpdate({ target: imapSettings.accountId, set: v })
  },

  async remove(id: string) {
    const rows = await s.db
      .delete(accounts)
      .where(and(eq(accounts.userId, s.userId), eq(accounts.id, id)))
      .returning({ id: accounts.id })
    return rows.length > 0
  },
})
