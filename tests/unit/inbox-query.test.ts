import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../../server/db/client'
import { actionItems, messages, triageResults } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'

async function setup(n = 0) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const r = forUser(db, user.id)
  const acc = await r.accounts.create({
    type: 'imap',
    email: 'a@x.test',
    displayName: '',
    color: 1,
  })
  const acc2 = await r.accounts.create({
    type: 'imap',
    email: 'b@x.test',
    displayName: '',
    color: 1,
  })
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
    { providerId: 'X', name: 'X', role: 'other', processed: false },
  ])
  await r.mail.upsertFolders(acc2.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const [f1, fx] = [
    (await r.mail.listFolders(acc.id)).find((f) => f.providerId === 'INBOX')!,
    (await r.mail.listFolders(acc.id)).find((f) => f.providerId === 'X')!,
  ]
  const f2 = (await r.mail.listFolders(acc2.id))[0]!
  const add = async (i: number, over: Partial<typeof messages.$inferInsert> = {}) => {
    const [m] = await db
      .insert(messages)
      .values({
        userId: user.id,
        accountId: acc.id,
        folderId: f1.id,
        providerMessageId: `m${i}`,
        fromAddress: 'a@b.test',
        subject: `S${i}`,
        sentAt: new Date(1_700_000_000_000 + i * 1000),
        receivedAt: new Date(1_700_000_000_000 + i * 1000),
        isRead: i % 2 === 0,
        ...over,
      })
      .returning()
    return m!
  }
  const triage = (messageId: string, o: Partial<typeof triageResults.$inferInsert> = {}) =>
    db.insert(triageResults).values({
      messageId,
      userId: user.id,
      category: 'other',
      importance: 'low',
      urgency: 'not_urgent',
      priority: 'p4_fyi',
      needsReply: false,
      summary: 's',
      reason: 'r',
      source: 'rule',
      ...o,
    })
  return { db, user, other, r, acc, acc2, f1, f2, fx, add, triage, n }
}

describe('inbox query', () => {
  it('counts every segment correctly', async () => {
    const s = await setup()
    const m = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => s.add(i)))
    await s.triage(m[0]!.id, { needsReply: true, importance: 'high', priority: 'p1_do_now' })
    await s.triage(m[1]!.id, { category: 'newsletter_marketing' })
    await s.triage(m[2]!.id, { category: 'notification_automated' })
    await s.triage(m[3]!.id)
    await s.db.insert(actionItems).values([
      { userId: s.user.id, messageId: m[0]!.id, itemText: 'do it' },
      { userId: s.user.id, messageId: m[4]!.id, itemText: 'done', status: 'done' },
    ])
    await s.add(7, { folderId: s.fx.id }) // unprocessed folder: excluded
    expect(await s.r.inbox.counts()).toEqual({
      all: 6,
      needs_reply: 1,
      actions: 1,
      important: 1,
      fyi: 3,
      newsletters: 2,
    })
    expect(await s.r.inbox.unreadCount()).toBe(3)
    await s.add(8, { accountId: s.acc2.id, folderId: s.f2.id })
    expect((await s.r.inbox.counts(s.acc2.id)).all).toBe(1)
    expect((await s.r.inbox.counts()).all).toBe(7)
  })

  it('pages newest first with a stable cursor, including equal timestamps', async () => {
    const s = await setup()
    for (let i = 1; i <= 5; i++) await s.add(i)
    await s.add(6, { receivedAt: new Date(1_700_000_005_000) }) // same time as #5
    const seen: string[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 5; guard++) {
      const p = await s.r.inbox.list({ segment: 'all', limit: 4, cursor })
      seen.push(...p.items.map((x) => x.subject))
      if (!p.nextCursor) break
      cursor = p.nextCursor
    }
    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(6)
    await expect(s.r.inbox.list({ segment: 'all', cursor: 'garbage' })).rejects.toThrow(
      'bad_cursor',
    )
  })

  it('includes triage fields and never leaks across users', async () => {
    const s = await setup()
    const m = await s.add(1)
    await s.triage(m.id, { summary: 'Pay it', priority: 'p2_today' })
    const p = await s.r.inbox.list({ segment: 'all' })
    expect(p.items[0]).toMatchObject({ summary: 'Pay it', priority: 'p2_today' })
    const o = forUser(s.db, s.other.id)
    expect((await o.inbox.list({ segment: 'all' })).items).toEqual([])
    expect((await o.inbox.counts()).all).toBe(0)
  })

  it('stays fast with thousands of messages', async () => {
    const s = await setup()
    await s.db
      .execute(sql`insert into messages (user_id, account_id, folder_id, provider_message_id, from_address, subject, sent_at, received_at)
      select ${s.user.id}, ${s.acc.id}, ${s.f1.id}, 'g'||g, 'x@y.test', 'S'||g, now() - (g||' seconds')::interval, now() - (g||' seconds')::interval from generate_series(1, 5000) g`)
    const t0 = performance.now()
    const p = await s.r.inbox.list({ segment: 'all', limit: 30 })
    const dt = performance.now() - t0
    expect(p.items).toHaveLength(30)
    expect(dt).toBeLessThan(150)
  })
})
