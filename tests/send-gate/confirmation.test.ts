import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages, sessions } from '../../server/db/schema'
import { draftSaver } from '../../server/drafts/save'
import { sendConfirmation } from '../../server/mail/send/confirmation'
import { sendGate } from '../../server/mail/send/send-gate'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { FakeMailProvider } from '../helpers/fake-mail-provider'

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({
    email: 'u@x.io',
    passwordHash: 'h',
    displayName: 'Priya',
  })
  const r = forUser(db, user.id)
  const acc = await r.accounts.create({
    type: 'imap',
    email: 'me@corp.example',
    displayName: '',
    color: 1,
  })
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const f = (await r.mail.listFolders(acc.id))[0]!
  const t = await r.mail.upsertThread(acc.id, 'thr', 'Q3', new Date())
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
      fromName: 'Alex',
      toJson: [{ address: 'me@corp.example' }, { address: 'bo@acme.example' }],
      subject: 'Q3 numbers',
      bodyText: 'Please see https://acme.example/q3 or call +44 20 7946 0958.',
      sentAt: new Date(),
      receivedAt: new Date(),
    })
    .returning()
  await db
    .insert(sessions)
    .values({ id: 'sess-1', userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) })
  const provider = new FakeMailProvider()
  const ring = { current: { version: 1, key: randomBytes(32) } }
  const gate = sendGate({ db, ring })
  const saver = draftSaver({ db, providerFor: async () => provider })
  const svc = sendConfirmation({ db, gate, saver })
  await r.settings.setMany({ 'profile.signature': 'Priya Sharma', 'send.undoSeconds': 5 })
  const draft = (o: object = {}) => ({
    body: 'Thanks, will do.',
    to: ['alex@acme.example'],
    cc: [],
    ...o,
  })
  const auth = (hash: string, o: object = {}, body: object = draft()) =>
    svc.authorize(user.id, { id: 'sess-1' }, m!.id, body, {
      previewHash: hash,
      stepUpSatisfied: true,
      confirmedAt: new Date(),
      ...o,
    })
  return { db, user, r, acc, m: m!, provider, gate, svc, draft, auth }
}

describe('send confirmation: prepare', () => {
  it('saves the draft and returns exactly what would be sent: signature, server-computed subject, hash', async () => {
    const s = await setup()
    const p = await s.svc.prepare(s.user.id, s.m.id, s.draft())
    if (!p.ok) throw new Error(JSON.stringify(p.error))
    expect(p.value).toMatchObject({
      from: { address: 'me@corp.example', name: 'Priya' },
      to: ['alex@acme.example'],
      subject: 'Re: Q3 numbers',
      bodyText: 'Thanks, will do.\n\nPriya Sharma',
      placeholders: [],
    })
    expect(p.value.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(s.provider.drafts.size).toBe(1)
    expect(await s.db.execute('select count(*)::int n from send_authorizations')).toMatchObject({
      rows: [{ n: 0 }],
    }) // nothing authorized yet
  })

  it('flags new recipients, external domains, foreign links/addresses/numbers and placeholders', async () => {
    const s = await setup()
    const p = await s.svc.prepare(
      s.user.id,
      s.m.id,
      s.draft({
        to: ['alex@acme.example', 'stranger@elsewhere.test'],
        cc: ['bo@acme.example'],
        body: 'Pay at https://evil.test/p, call +49 30 1234 5678, ask eve@evil.test. [confirm date] Also see https://acme.example/q3.',
      }),
    )
    if (!p.ok) throw new Error('x')
    expect(p.value.flags.newRecipients).toEqual(['stranger@elsewhere.test'])
    expect(p.value.flags.externalDomains.sort()).toEqual(['acme.example', 'elsewhere.test'])
    expect(p.value.flags.foreign.map((f) => f.value).sort()).toEqual([
      '+49 30 1234 5678',
      'eve@evil.test',
      'https://evil.test/p',
    ])
    expect(p.value.placeholders).toEqual(['[confirm date]'])
  })

  it('validates input and ownership; a provider failure means nothing can be sent', async () => {
    const s = await setup()
    expect(await s.svc.prepare(s.user.id, s.m.id, s.draft({ to: ['nope'] }))).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    })
    const other = await authRepo(s.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    expect(await s.svc.prepare(other.id, s.m.id, s.draft())).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    s.provider.failNext = { kind: 'network' }
    expect(await s.svc.prepare(s.user.id, s.m.id, s.draft())).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    await s.r.accounts.update(s.acc.id, { status: 'needs_reauth' })
    expect(await s.svc.prepare(s.user.id, s.m.id, s.draft())).toMatchObject({
      ok: false,
      error: { kind: 'auth' },
    })
  })
})

describe('send confirmation: authorize', () => {
  it('issues an authorization only for the previewed content, and the sealed content is what was shown', async () => {
    const s = await setup()
    const p = await s.svc.prepare(s.user.id, s.m.id, s.draft())
    if (!p.ok) throw new Error('x')
    const a = await s.auth(p.value.contentHash)
    if (!a.ok) throw new Error(JSON.stringify(a.error))
    expect(a.value.ref).toBe(s.gate.hashNonce(a.value.nonce).slice(0, 16))
    const redeemed = await s.gate.redeem(s.user.id, s.gate.hashNonce(a.value.nonce))
    expect(redeemed).toMatchObject({
      ok: true,
      value: {
        content: { bodyText: 'Thanks, will do.\n\nPriya Sharma', subject: 'Re: Q3 numbers' },
      },
    })
  })

  it('refuses when the text differs from what the user saw (edited after the preview)', async () => {
    const s = await setup()
    const p = await s.svc.prepare(s.user.id, s.m.id, s.draft())
    if (!p.ok) throw new Error('x')
    for (const changed of [
      s.draft({ body: 'Thanks, will do!' }),
      s.draft({ to: ['eve@evil.test'] }),
      s.draft({ cc: ['eve@evil.test'] }),
    ])
      expect(await s.auth(p.value.contentHash, {}, changed)).toEqual({
        ok: false,
        error: { kind: 'send_refused', reason: 'content_changed' },
      })
    expect(await s.db.execute('select count(*)::int n from send_authorizations')).toMatchObject({
      rows: [{ n: 0 }],
    })
    // Recipient order and case do not matter.
    const two = await s.svc.prepare(
      s.user.id,
      s.m.id,
      s.draft({ to: ['alex@acme.example', 'bo@acme.example'] }),
    )
    if (!two.ok) throw new Error('x')
    expect(
      (
        await s.auth(
          two.value.contentHash,
          {},
          s.draft({ to: ['BO@acme.example', 'alex@acme.example'] }),
        )
      ).ok,
    ).toBe(true)
  })

  it('a wrong or malformed preview hash is refused', async () => {
    const s = await setup()
    await s.svc.prepare(s.user.id, s.m.id, s.draft())
    expect(await s.auth('0'.repeat(64))).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'content_changed' },
    })
  })

  it('placeholders block unless the user overrides; step-up is required unless switched off', async () => {
    const s = await setup()
    const body = s.draft({ body: 'Is [confirm date] ok?' })
    const p = await s.svc.prepare(s.user.id, s.m.id, body)
    if (!p.ok) throw new Error('x')
    expect(await s.auth(p.value.contentHash, {}, body)).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'placeholders' },
    })
    expect((await s.auth(p.value.contentHash, { placeholderOverride: true }, body)).ok).toBe(true)
    expect(
      await s.auth(
        p.value.contentHash,
        { placeholderOverride: true, stepUpSatisfied: false },
        body,
      ),
    ).toEqual({ ok: false, error: { kind: 'send_refused', reason: 'step_up_required' } })
  })

  it('refuses an unsaved draft (authorize never saves one) and a message of another user', async () => {
    const s = await setup()
    expect(await s.auth('0'.repeat(64))).toEqual({ ok: false, error: { kind: 'not_found' } })
    const p = await s.svc.prepare(s.user.id, s.m.id, s.draft())
    if (!p.ok) throw new Error('x')
    const other = await authRepo(s.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    expect(
      await s.svc.authorize(other.id, { id: 'sess-1' }, s.m.id, s.draft(), {
        previewHash: p.value.contentHash,
        stepUpSatisfied: true,
        confirmedAt: new Date(),
      }),
    ).toEqual({ ok: false, error: { kind: 'not_found' } })
  })
})

describe('send confirmation: undo and status', () => {
  it('reports waiting, then cancelled after undo; undo after release is too late', async () => {
    const s = await setup()
    const p = await s.svc.prepare(s.user.id, s.m.id, s.draft())
    if (!p.ok) throw new Error('x')
    const a = await s.auth(p.value.contentHash)
    if (!a.ok) throw new Error('x')
    expect(await s.svc.status(s.user.id, a.value.nonce)).toMatchObject({ state: 'waiting' })
    expect(await s.svc.undo(s.user.id, a.value.nonce)).toBe(true)
    expect(await s.svc.status(s.user.id, a.value.nonce)).toMatchObject({ state: 'cancelled' })
    expect(await s.svc.undo(s.user.id, a.value.nonce)).toBe(false)
    expect(await s.svc.status(s.user.id, 'f'.repeat(32))).toEqual({ state: 'unknown_ref' })
    const b = await s.auth(p.value.contentHash)
    if (!b.ok) throw new Error('x')
    await s.gate.redeem(s.user.id, s.gate.hashNonce(b.value.nonce)) // released
    expect(await s.svc.undo(s.user.id, b.value.nonce)).toBe(false)
    expect(await s.svc.status(s.user.id, b.value.nonce)).toMatchObject({ state: 'sending' })
  })
})
