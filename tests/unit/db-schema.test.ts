import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { users, accounts, messages, folders, triageResults, secrets } from '../../server/db/schema'
import { eq } from 'drizzle-orm'

let t: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  t = await createTestDb()
})
afterAll(async () => t.close())

async function tables() {
  const r = await t.raw.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' and table_name not like '%drizzle%'",
  )
  return r.rows.map((x) => x.table_name)
}

describe('schema', () => {
  it('migrations apply on an empty database', async () => {
    const names = await tables()
    for (const n of [
      'users',
      'sessions',
      'accounts',
      'messages',
      'triage_results',
      'send_records',
      'secrets',
      'ai_providers',
      'push_subscriptions',
      'audit_log',
    ])
      expect(names).toContain(n)
  })

  it('every table except users carries a user_id with a cascading foreign key', async () => {
    const names = (await tables()).filter((n) => n !== 'users')
    for (const n of names) {
      const col = await t.raw.query(
        "select 1 from information_schema.columns where table_name=$1 and column_name='user_id'",
        [n],
      )
      expect(col.rows.length, `${n} has user_id`).toBe(1)
      const fk = await t.raw.query(
        `select rc.delete_rule from information_schema.key_column_usage k
         join information_schema.referential_constraints rc on rc.constraint_name = k.constraint_name
         where k.table_name=$1 and k.column_name='user_id'`,
        [n],
      )
      expect(fk.rows[0]?.delete_rule, `${n} cascades on user delete`).toBe('CASCADE')
    }
  })

  it('deleting a user removes everything they own', async () => {
    const [u] = await t.db
      .insert(users)
      .values({ email: 'a@x.test', passwordHash: 'h' })
      .returning()
    const [a] = await t.db
      .insert(accounts)
      .values({ userId: u!.id, type: 'imap', email: 'a@x.test' })
      .returning()
    const [f] = await t.db
      .insert(folders)
      .values({
        userId: u!.id,
        accountId: a!.id,
        providerId: 'INBOX',
        name: 'Inbox',
        role: 'inbox',
      })
      .returning()
    const [m] = await t.db
      .insert(messages)
      .values({
        userId: u!.id,
        accountId: a!.id,
        folderId: f!.id,
        providerMessageId: '1',
        fromAddress: 'b@x.test',
        sentAt: new Date(),
        receivedAt: new Date(),
      })
      .returning()
    await t.db.insert(triageResults).values({
      messageId: m!.id,
      userId: u!.id,
      category: 'other',
      importance: 'low',
      urgency: 'not_urgent',
      priority: 'p4_fyi',
      needsReply: false,
      summary: 's',
      reason: 'r',
      source: 'rule',
    })
    await t.db.insert(secrets).values({ userId: u!.id, name: 'k', ciphertext: 'c' })
    await t.db.delete(users).where(eq(users.id, u!.id))
    for (const tbl of [accounts, folders, messages, triageResults, secrets])
      expect(await t.db.select().from(tbl)).toHaveLength(0)
  })

  it('enforces per-account uniqueness of provider message ids', async () => {
    const [u] = await t.db
      .insert(users)
      .values({ email: 'u2@x.test', passwordHash: 'h' })
      .returning()
    const [a] = await t.db
      .insert(accounts)
      .values({ userId: u!.id, type: 'gmail', email: 'u2@x.test' })
      .returning()
    const [f] = await t.db
      .insert(folders)
      .values({ userId: u!.id, accountId: a!.id, providerId: 'INBOX', name: 'Inbox' })
      .returning()
    const row = {
      userId: u!.id,
      accountId: a!.id,
      folderId: f!.id,
      providerMessageId: 'dup',
      fromAddress: 'b@x.test',
      sentAt: new Date(),
      receivedAt: new Date(),
    }
    await t.db.insert(messages).values(row)
    await expect(t.db.insert(messages).values(row)).rejects.toThrow()
  })
})
