import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages } from '../../server/db/schema'
import { draftSaver, withSignature } from '../../server/drafts/save'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { FakeMailProvider } from '../helpers/fake-mail-provider'

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const r = forUser(db, user.id)
  const acc = await r.accounts.create({
    type: 'imap',
    email: 'me@x.test',
    displayName: '',
    color: 1,
  })
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const f = (await r.mail.listFolders(acc.id))[0]!
  const t = await r.mail.upsertThread(acc.id, 'thr', 'Q3 numbers', new Date())
  const [m] = await db
    .insert(messages)
    .values({
      userId: user.id,
      accountId: acc.id,
      folderId: f.id,
      threadId: t.id,
      providerMessageId: 'pm1',
      internetMessageId: '<orig@acme.example>',
      fromAddress: 'alex@acme.example',
      subject: 'Q3 numbers',
      sentAt: new Date(),
      receivedAt: new Date(),
    })
    .returning()
  const provider = new FakeMailProvider()
  let n = 0
  const saver = draftSaver({
    db,
    providerFor: async () => provider,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  })
  return { db, user, other, r, acc, m: m!, provider, saver }
}
const KEY = '00000000-0000-4000-8000-000000000001' // the first id the saver asks for is the idempotency key
const body = (o: object = {}) => ({
  body: 'Thanks, will do.',
  to: ['alex@acme.example'],
  cc: [],
  tone: 'friendly',
  intent: 'accept',
  ...o,
})

describe('withSignature', () => {
  it('appends the signature once', () => {
    expect(withSignature('Hi\n\n', 'Priya')).toBe('Hi\n\nPriya')
    expect(withSignature('Hi\n\nPriya', 'Priya')).toBe('Hi\n\nPriya')
    expect(withSignature('Hi', '  ')).toBe('Hi')
  })
})

describe('draft saver', () => {
  it('stores the local row first, creates the provider draft with the signature and thread, and marks it saved', async () => {
    const s = await setup()
    await s.r.settings.setMany({ 'profile.signature': 'Priya Sharma' })
    const res = await s.saver.save(s.user.id, s.m.id, body())
    if (!res.ok) throw new Error(JSON.stringify(res.error))
    expect(res.value.status).toBe('saved')
    const row = (await s.r.drafts.forMessage(s.m.id))!
    expect(row).toMatchObject({
      status: 'saved',
      idempotencyKey: KEY,
      providerDraftId: res.value.providerDraftId,
      tone: 'friendly',
      intent: 'accept',
    })
    expect(row.bodyPreview).toBe('Thanks, will do.\n\nPriya Sharma')
    const made = [...s.provider.drafts.values()][0]!.draft
    expect(made).toMatchObject({
      subject: 'Re: Q3 numbers',
      bodyText: 'Thanks, will do.\n\nPriya Sharma',
      idempotencyKey: KEY,
      mode: 'reply',
    })
    expect(made.inReplyTo).toMatchObject({
      internetMessageId: '<orig@acme.example>',
      providerThreadId: 'thr',
    })
  })

  it('saving again updates the same draft: no second row, no second provider draft', async () => {
    const s = await setup()
    const a = await s.saver.save(s.user.id, s.m.id, body())
    const b = await s.saver.save(s.user.id, s.m.id, body({ body: 'Edited.' }))
    if (!a.ok || !b.ok) throw new Error('x')
    expect(b.value.id).toBe(a.value.id)
    expect(b.value.providerDraftId).toBe(a.value.providerDraftId)
    expect(s.provider.drafts.size).toBe(1)
    expect([...s.provider.drafts.values()][0]!.draft.bodyText).toBe('Edited.')
    expect(await s.db.execute('select count(*)::int as n from draft_refs')).toMatchObject({
      rows: [{ n: 1 }],
    })
  })

  it('a failed save keeps the local row and key; the retry reuses the key (no duplicate)', async () => {
    const s = await setup()
    s.provider.failNext = { kind: 'network' }
    expect(await s.saver.save(s.user.id, s.m.id, body())).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    const row = (await s.r.drafts.forMessage(s.m.id))!
    expect(row).toMatchObject({ status: 'local', providerDraftId: null, idempotencyKey: KEY })
    expect(s.provider.drafts.size).toBe(0)
    const retry = await s.saver.save(s.user.id, s.m.id, body())
    expect(retry.ok).toBe(true)
    expect((await s.r.drafts.forMessage(s.m.id))!.idempotencyKey).toBe(KEY)
    expect(s.provider.drafts.size).toBe(1)
  })

  it('a provider that cannot be built reports needs_reauth and still keeps the row', async () => {
    const s = await setup()
    const saver = draftSaver({
      db: s.db,
      providerFor: async () => {
        throw new Error('no token')
      },
    })
    expect(await saver.save(s.user.id, s.m.id, body())).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'needs_reauth' },
    })
    expect((await s.r.drafts.forMessage(s.m.id))!.status).toBe('local')
  })

  it('validates input and ownership', async () => {
    const s = await setup()
    expect(await s.saver.save(s.user.id, s.m.id, body({ to: [] }))).toMatchObject({
      ok: false,
      error: { code: 'no_recipients' },
    })
    expect(await s.saver.save(s.user.id, s.m.id, body({ to: ['nope'] }))).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    })
    expect(await s.saver.save(s.other.id, s.m.id, body())).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(await s.saver.save(s.user.id, '00000000-0000-0000-0000-000000000000', body())).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(s.provider.drafts.size).toBe(0)
  })

  it('discard deletes our provider draft and forgets it; a later save starts a fresh draft', async () => {
    const s = await setup()
    await s.saver.save(s.user.id, s.m.id, body())
    expect(await s.saver.discard(s.user.id, s.m.id)).toEqual({ ok: true, value: undefined })
    expect(s.provider.drafts.size).toBe(0)
    expect(await s.r.drafts.forMessage(s.m.id)).toBeNull()
    expect((await s.saver.save(s.user.id, s.m.id, body())).ok).toBe(true)
    expect(s.provider.drafts.size).toBe(1)
    expect(await s.saver.discard(s.other.id, s.m.id)).toEqual({ ok: true, value: undefined }) // nothing of theirs
    expect(s.provider.drafts.size).toBe(1)
  })
})
