import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { syncAccount, syncUser } from '../../server/sync/sync-account'
import { sampleMessage } from '../contract/mail-provider-contract'
import { FakeMailProvider } from '../helpers/fake-mail-provider'

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const repos = forUser(db, user.id)
  const account = await repos.accounts.create({
    type: 'imap',
    email: 'me@x.test',
    displayName: 'Me',
    color: 1,
  })
  const provider = new FakeMailProvider()
  return { db, user, repos, account, provider }
}
const opts = (s: Awaited<ReturnType<typeof setup>>) => ({
  db: s.db,
  userId: s.user.id,
  accountId: s.account.id,
  provider: s.provider,
  pageSize: 2,
})
const count = async (s: Awaited<ReturnType<typeof setup>>) =>
  (await s.repos.mail.recent(100)).length

describe('syncAccount', () => {
  it('pulls pages, stores sanitized html, and is incremental', async () => {
    const s = await setup()
    for (const id of ['1', '2', '3'])
      s.provider.messages.set(
        id,
        sampleMessage(id, 't', {
          bodyHtml: '<p>Hi<script>alert(1)</script><img src="http://track.test/x.gif"></p>',
        }),
      )
    const pages: number[] = []
    const r = await syncAccount({ ...opts(s), onPage: (p) => pages.push(p.added.length) })
    expect(r).toEqual({ ok: true, added: 3, removed: 0 })
    expect(pages).toEqual([2, 1])
    const [m] = await s.repos.mail.recent(1)
    expect(m!.bodyHtmlSanitized).not.toContain('<script')
    expect(m!.bodyHtmlSanitized).not.toMatch(/ src="http/)
    expect(m!.snippet).toBe('Please send the numbers.')
    const again = await syncAccount(opts(s))
    expect(again).toEqual({ ok: true, added: 0, removed: 0 })
    s.provider.messages.set('4', sampleMessage('4'))
    expect(await syncAccount(opts(s))).toMatchObject({ added: 1 })
    expect(await count(s)).toBe(4)
  })

  it('a crash before commit replays the page and never skips it', async () => {
    const s = await setup()
    for (const id of ['1', '2', '3']) s.provider.messages.set(id, sampleMessage(id))
    let n = 0
    await expect(
      syncAccount({
        ...opts(s),
        beforeCommit: () => {
          if (++n === 2) throw new Error('crash')
        },
      }),
    ).rejects.toThrow('crash')
    expect(await count(s)).toBe(2) // first page committed, second not
    const r = await syncAccount(opts(s))
    expect(r).toMatchObject({ ok: true, added: 1 })
    expect(await count(s)).toBe(3)
  })

  it('removes deleted messages', async () => {
    const s = await setup()
    s.provider.messages.set('1', sampleMessage('1'))
    await syncAccount(opts(s))
    const orig = s.provider.fetchChanges.bind(s.provider)
    s.provider.fetchChanges = async (i) => {
      const r = await orig(i)
      return r.ok ? { ok: true, value: { ...r.value, removedIds: ['1'] } } : r
    }
    expect(await syncAccount(opts(s))).toMatchObject({ removed: 1 })
    expect(await count(s)).toBe(0)
  })

  it('reports provider failures without losing earlier progress', async () => {
    const s = await setup()
    s.provider.messages.set('1', sampleMessage('1'))
    s.provider.failNext = { kind: 'network' }
    expect(await syncAccount(opts(s))).toEqual({ ok: false, error: { kind: 'network' }, added: 0 })
    expect(await syncAccount(opts(s))).toMatchObject({ ok: true, added: 1 })
  })

  it('syncs only processed folders and ignores a second concurrent run', async () => {
    const s = await setup()
    s.provider.folders = [
      { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
      { providerId: 'Other', name: 'Other', role: 'other', processed: false },
    ]
    s.provider.messages.set('1', sampleMessage('1'))
    const [a, b] = await Promise.all([syncAccount(opts(s)), syncAccount(opts(s))])
    expect([a, b].filter((r) => r.ok && r.added === 1)).toHaveLength(1)
    const folders = await s.repos.mail.listFolders(s.account.id)
    expect(folders.filter((f) => f.processed).map((f) => f.providerId)).toEqual(['INBOX'])
  })

  it("one account's failure does not block the others", async () => {
    const s = await setup()
    const second = await s.repos.accounts.create({
      type: 'imap',
      email: 'b@x.test',
      displayName: 'B',
      color: 1,
    })
    const good = new FakeMailProvider()
    good.messages.set('9', sampleMessage('9'))
    const res = await syncUser({
      db: s.db,
      userId: s.user.id,
      providerFor: async (id) => {
        if (id === s.account.id) throw new Error('boom')
        return good
      },
    })
    expect(res[s.account.id]).toMatchObject({ ok: false })
    expect(res[second.id]).toMatchObject({ ok: true, added: 1 })
  })
})
