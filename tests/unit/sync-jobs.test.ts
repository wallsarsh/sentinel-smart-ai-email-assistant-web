import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { jobQueue } from '../../server/jobs/queue'
import {
  clampInterval,
  enqueueUserSyncs,
  requestRefresh,
  syncHandler,
  SYNC_JOB,
} from '../../server/jobs/sync'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { sampleMessage } from '../contract/mail-provider-contract'
import { FakeMailProvider } from '../helpers/fake-mail-provider'
import { sql } from 'drizzle-orm'

async function setup() {
  const { db } = await createTestDb()
  const a = await authRepo(db).createUser({ email: 'a@x.io', passwordHash: 'h' })
  const b = await authRepo(db).createUser({ email: 'b@x.io', passwordHash: 'h' })
  await forUser(db, a.id).accounts.create({
    type: 'imap',
    email: 'a@x.test',
    displayName: '',
    color: 1,
  })
  return { db, a, b, queue: jobQueue(db) }
}
const keys = async (db: Awaited<ReturnType<typeof setup>>['db']) =>
  (await db.execute(sql`select key from jobs order by key`)).rows.map((r) => String(r.key))

describe('sync scheduling', () => {
  it('clamps intervals to 5/15/30/60', () => {
    expect([1, 5, 9, 12, 20, 25, 45, 100, NaN, 'x'].map(clampInterval)).toEqual([
      5, 5, 5, 15, 15, 30, 30, 60, 15, 15,
    ])
  })

  it('queues one job per user with an active account, once per period', async () => {
    const s = await setup()
    const t = new Date('2026-10-28T10:07:00Z')
    expect(await enqueueUserSyncs(s.db, s.queue, t)).toBe(1) // b has no account
    expect(await enqueueUserSyncs(s.db, s.queue, new Date(t.getTime() + 60_000))).toBe(0)
    expect(await enqueueUserSyncs(s.db, s.queue, new Date(t.getTime() + 15 * 60_000))).toBe(1)
  })

  it('uses each user interval', async () => {
    const s = await setup()
    await forUser(s.db, s.a.id).settings.setMany({ 'bg.intervalMinutes': 60 })
    const t = new Date('2026-10-28T10:00:00Z')
    await enqueueUserSyncs(s.db, s.queue, t)
    expect(await enqueueUserSyncs(s.db, s.queue, new Date(t.getTime() + 30 * 60_000))).toBe(0)
    expect(await enqueueUserSyncs(s.db, s.queue, new Date(t.getTime() + 60 * 60_000))).toBe(1)
  })

  it('rate-limits manual refresh', async () => {
    const s = await setup()
    const waits = []
    for (let i = 0; i < 5; i++)
      waits.push(await requestRefresh(s.queue, s.a.id, new Date(1000 + i)))
    expect(waits.slice(0, 3)).toEqual([0, 0, 0])
    expect(waits[3]).toBeGreaterThan(0)
    expect((await keys(s.db)).filter((k) => k.includes(':now:'))).toHaveLength(3)
    expect(SYNC_JOB).toBe('mail.sync')
  })

  it('handler syncs, and throws for backoff only when everything failed retryably', async () => {
    const s = await setup()
    const p = new FakeMailProvider()
    p.messages.set('1', sampleMessage('1'))
    const job = (userId: string | null) => ({
      job: {} as never,
      userId,
      deadline: {} as never,
      payload: {},
    })
    await syncHandler({ db: s.db, providerFor: async () => p })(job(s.a.id))
    expect((await forUser(s.db, s.a.id).mail.recent(5)).length).toBe(1)
    const bad = new FakeMailProvider()
    bad.failNext = { kind: 'network' }
    await expect(
      syncHandler({ db: s.db, providerFor: async () => bad })(job(s.a.id)),
    ).rejects.toThrow('sync_failed_retryable')
    await expect(
      syncHandler({ db: s.db, providerFor: async () => p })(job(null)),
    ).resolves.toBeUndefined()
  })
})

describe('provider factory', () => {
  it('builds the provider matching the account type', async () => {
    const { providerFactory } = await import('../../server/mail/provider-factory')
    const { googleOAuth } = await import('../../server/mail/oauth/google')
    const { microsoftOAuth } = await import('../../server/mail/oauth/microsoft')
    const { randomBytes } = await import('node:crypto')
    const s = await setup()
    const repos = forUser(s.db, s.a.id)
    const g = await repos.accounts.create({
      type: 'gmail',
      email: 'g@x.test',
      displayName: '',
      color: 1,
    })
    const m = await repos.accounts.create({
      type: 'microsoft_graph',
      email: 'm@x.test',
      displayName: '',
      color: 1,
    })
    const imap = (await repos.accounts.list()).find((x) => x.type === 'imap')!
    await repos.accounts.putImap(imap.id, {
      imapHost: 'h',
      imapPort: 993,
      imapSecurity: 'implicit_tls',
      username: 'u',
      smtpHost: 's',
      smtpPort: 465,
      smtpSecurity: 'implicit_tls',
      smtpUsername: null,
      draftsFolder: null,
      sentFolder: null,
      serverSavesSent: false,
    })
    const ring = { current: { version: 1, key: randomBytes(32) } }
    const { secretStoreFor } = await import('../../server/security/secret-store')
    await secretStoreFor(s.db, s.a.id, ring).put(`imap:${imap.id}`, 'pw')
    const o = { clientId: 'c', clientSecret: 's', redirectUri: 'r', secret: 'k'.repeat(32) }
    const f = providerFactory({
      db: s.db,
      ring,
      google: googleOAuth(o),
      microsoft: microsoftOAuth({ ...o, authority: 'https://login.microsoftonline.com/common' }),
      connectImap: async () => ({ close: async () => undefined }) as never,
    })
    expect((await f(s.a.id, g.id)).type).toBe('gmail')
    expect((await f(s.a.id, m.id)).type).toBe('microsoft_graph')
    expect((await f(s.a.id, imap.id)).type).toBe('imap')
    await expect(f(s.b.id, g.id)).rejects.toThrow('account_not_found')
  })
})
