import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { escapeExceptMarks, toTsQuery } from '../../server/repos/search'

async function setup() {
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
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const folder = (await r.mail.listFolders(acc.id))[0]!
  let n = 0
  const add = async (
    subject: string,
    body: string,
    over: Partial<typeof messages.$inferInsert> = {},
  ) =>
    (
      await db
        .insert(messages)
        .values({
          userId: user.id,
          accountId: acc.id,
          folderId: folder.id,
          providerMessageId: `m${++n}`,
          fromAddress: 'sender@corp.test',
          fromName: 'Sam Sender',
          subject,
          bodyText: body,
          sentAt: new Date(1_700_000_000_000 + n * 1000),
          receivedAt: new Date(1_700_000_000_000 + n * 1000),
          ...over,
        })
        .returning()
    )[0]!
  return { db, user, other, r, acc, add }
}

describe('search', () => {
  it('builds safe prefix queries', () => {
    expect(toTsQuery('quart rep')).toBe('quart:* & rep:*')
    expect(toTsQuery(`'); drop table messages; --`)).toBe('drop:* & table:* & messages:*')
    expect(toTsQuery('!!! ()')).toBeNull()
    expect(toTsQuery('Zürich 2026')).toBe('Zürich:* & 2026:*')
    expect(toTsQuery('a '.repeat(30))!.split(' & ')).toHaveLength(8)
  })

  it('finds by prefix in subject, body and sender and highlights', async () => {
    const s = await setup()
    await s.add('Quarterly report', 'Numbers attached for the board meeting')
    await s.add('Lunch', 'Pizza on Friday?')
    expect((await s.r.search.search({ text: 'quart' })).map((h) => h.subject)).toEqual([
      'Quarterly report',
    ])
    const hit = (await s.r.search.search({ text: 'board meet' }))[0]!
    expect(hit.headline).toContain('<mark>board</mark>')
    expect((await s.r.search.search({ text: 'sender' })).length).toBe(2)
    expect(await s.r.search.search({ text: 'nonexistent' })).toEqual([])
  })

  it('is inert for special characters and escapes html in snippets', async () => {
    const s = await setup()
    await s.add('Tag', 'hello <script>alert(1)</script> world & more')
    expect(await s.r.search.search({ text: `"'&|!():*<>\\` })).toEqual([])
    const h = (await s.r.search.search({ text: 'hello' }))[0]!
    expect(h.headline).not.toContain('<script')
    expect(escapeExceptMarks('<b><mark>x</mark>&')).toBe('&lt;b&gt;<mark>x</mark>&amp;')
  })

  it('tracks inserts and deletes and never crosses users', async () => {
    const s = await setup()
    const m = await s.add('Invoice', 'pay')
    expect(await s.r.search.search({ text: 'invoice' })).toHaveLength(1)
    await s.db.execute(`delete from messages where id = '${m.id}'`)
    expect(await s.r.search.search({ text: 'invoice' })).toHaveLength(0)
    await s.add('Secret', 'plan')
    expect(await forUser(s.db, s.other.id).search.search({ text: 'secret' })).toEqual([])
  })

  it('filters by unread and account, and ignores unprocessed folders', async () => {
    const s = await setup()
    await s.add('Read one', 'x', { isRead: true })
    await s.add('Unread one', 'x', { isRead: false })
    expect(
      (await s.r.search.search({ text: 'one', unreadOnly: true })).map((h) => h.subject),
    ).toEqual(['Unread one'])
    expect(
      await s.r.search.search({ text: 'one', accountId: '00000000-0000-0000-0000-000000000000' }),
    ).toEqual([])
    await s.r.mail.setProcessed(s.acc.id, [])
    expect(await s.r.search.search({ text: 'one' })).toEqual([])
  })
})
