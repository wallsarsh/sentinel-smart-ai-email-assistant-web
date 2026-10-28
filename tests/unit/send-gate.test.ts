import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { sendRecords, sessions } from '../../server/db/schema'
import {
  contentHash,
  unresolvedPlaceholders,
  type ApprovedContent,
} from '../../server/mail/send/approved-content'
import { MAX_CONFIRMATION_AGE_MS, sendGate, VALIDITY_MS } from '../../server/mail/send/send-gate'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { secretStoreFor } from '../../server/security/secret-store'

const content = (o: Partial<ApprovedContent> = {}): ApprovedContent => ({
  accountId: '',
  from: { address: 'me@x.test' },
  to: [{ address: 'alex@acme.example' }, { address: 'bo@acme.example' }],
  cc: [],
  subject: 'Re: Q3',
  bodyText: 'Will do.',
  inReplyToInternetMessageId: '<o@x>',
  draftRef: { providerDraftId: 'd1', providerMessageId: null },
  ...o,
})

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
  const ring = { current: { version: 1, key: randomBytes(32) } }
  let t = new Date('2026-10-28T10:00:00Z')
  const sessionId = 'sess-hash-1'
  await db
    .insert(sessions)
    .values({ id: sessionId, userId: user.id, expiresAt: new Date('2026-11-30T00:00:00Z') })
  const gate = sendGate({ db, ring, now: () => t })
  const c = content({ accountId: acc.id })
  const conf = (o: object = {}) => ({
    confirmedAt: new Date(t),
    sessionId,
    stepUpSatisfied: true,
    ...o,
  })
  return {
    db,
    user,
    other,
    r,
    acc,
    ring,
    gate,
    c,
    conf,
    sessionId,
    advance: (ms: number) => (t = new Date(t.getTime() + ms)),
    now: () => t,
  }
}
type S = Awaited<ReturnType<typeof setup>>
const authorize = async (s: S, c = s.c, o = {}) => {
  const r = await s.gate.authorize(s.user.id, c, s.conf(), o)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('content hash', () => {
  it('ignores recipient order, duplicates and address case, nothing else', () => {
    const base = content()
    const h = contentHash(base)
    expect(contentHash({ ...base, to: [...base.to].reverse() })).toBe(h)
    expect(
      contentHash({
        ...base,
        to: [
          { address: 'ALEX@acme.example' },
          { address: 'bo@ACME.example' },
          { address: 'alex@acme.example' },
        ],
      }),
    ).toBe(h)
    expect(contentHash({ ...base, from: { address: 'ME@X.TEST', name: 'Me' } })).toBe(h)
    expect(
      contentHash({ ...base, draftRef: { providerDraftId: 'other', providerMessageId: 'x' } }),
    ).toBe(h)
    for (const changed of [
      { bodyText: 'Will do!' },
      { bodyText: 'Will do. ' },
      { subject: 'Re: Q4' },
      { cc: [{ address: 'x@y.test' }] },
      { to: [{ address: 'alex@acme.example' }] },
      { inReplyToInternetMessageId: '<p@x>' },
      { accountId: 'b' },
    ])
      expect(contentHash({ ...base, ...changed }), JSON.stringify(changed)).not.toBe(h)
  })
  it('finds placeholders', () =>
    expect(unresolvedPlaceholders({ bodyText: 'Hi [name], [confirm date]. [x]' })).toEqual([
      '[name]',
      '[confirm date]',
    ]))
})

describe('authorize', () => {
  it('issues a single-use authorization, stores only a hash of the nonce, and seals the content', async () => {
    const s = await setup()
    const a = await authorize(s)
    expect(a.nonce).toMatch(/^[0-9a-f]{32}$/)
    const row = (await s.r.send.getAuthorization(s.gate.hashNonce(a.nonce)))!
    expect(row).toMatchObject({
      state: 'issued',
      contentHash: contentHash(s.c),
      sessionId: s.sessionId,
    })
    expect(JSON.stringify(row)).not.toContain(a.nonce)
    const sealed = await s.r.secrets.getCiphertext(`send:${row.nonceHash}`)
    expect(sealed).not.toContain('Will do.')
    expect(a.releaseAt.getTime() - s.now().getTime()).toBe(5000) // default undo window
    expect(a.expiresAt.getTime() - a.releaseAt.getTime()).toBe(VALIDITY_MS)
  })

  it.each([
    ['no recipients', (s: S) => ({ ...s.c, to: [], cc: [] }), 'no_recipients'],
    ['empty body', (s: S) => ({ ...s.c, bodyText: '  \n' }), 'empty_body'],
    ['placeholders', (s: S) => ({ ...s.c, bodyText: 'Is [confirm date] ok?' }), 'placeholders'],
    [
      'unknown account',
      (s: S) => ({ ...s.c, accountId: '00000000-0000-4000-8000-000000000000' }),
      'unknown_authorization',
    ],
  ])('refuses: %s', async (_n, mk, want) => {
    const s = await setup()
    expect(await s.gate.authorize(s.user.id, mk(s), s.conf())).toEqual({ ok: false, error: want })
  })

  it('a placeholder override is honoured only when asked for, and the block can be switched off', async () => {
    const s = await setup()
    const c = { ...s.c, bodyText: 'Is [confirm date] ok?' }
    expect((await s.gate.authorize(s.user.id, c, s.conf(), { placeholderOverride: true })).ok).toBe(
      true,
    )
    await s.r.settings.setMany({ 'send.blockOnPlaceholders': false })
    expect((await s.gate.authorize(s.user.id, c, s.conf())).ok).toBe(true)
  })

  it('refuses stale, future-dated or step-up-less confirmations', async () => {
    const s = await setup()
    expect(
      await s.gate.authorize(
        s.user.id,
        s.c,
        s.conf({ confirmedAt: new Date(s.now().getTime() - MAX_CONFIRMATION_AGE_MS - 1) }),
      ),
    ).toEqual({ ok: false, error: 'not_confirmed' })
    expect(
      await s.gate.authorize(
        s.user.id,
        s.c,
        s.conf({ confirmedAt: new Date(s.now().getTime() + 60_000) }),
      ),
    ).toEqual({ ok: false, error: 'not_confirmed' })
    expect(await s.gate.authorize(s.user.id, s.c, s.conf({ stepUpSatisfied: false }))).toEqual({
      ok: false,
      error: 'step_up_required',
    })
    await s.r.settings.setMany({ 'send.requireStepUp': false })
    expect((await s.gate.authorize(s.user.id, s.c, s.conf({ stepUpSatisfied: false }))).ok).toBe(
      true,
    )
  })

  it('enforces the daily limit on sends that reached or may have reached the provider', async () => {
    const s = await setup()
    await s.r.settings.setMany({ 'send.dailyLimit': 2 })
    const rec = (status: 'sent' | 'failed' | 'pending' | 'unknown') =>
      s.db.insert(sendRecords).values({
        userId: s.user.id,
        accountId: s.acc.id,
        internetMessageId: `<${status}@x>`,
        contentHash: 'h',
        recipientCount: 1,
        status,
        approvedAt: s.now(),
      })
    await rec('failed')
    await rec('pending')
    expect((await s.gate.authorize(s.user.id, s.c, s.conf())).ok).toBe(true) // failed/pending do not count
    await rec('sent')
    await rec('unknown')
    expect(await s.gate.authorize(s.user.id, s.c, s.conf())).toEqual({
      ok: false,
      error: 'daily_limit',
    })
    s.advance(24 * 3600_000)
    expect((await s.gate.authorize(s.user.id, s.c, s.conf())).ok).toBe(true)
    await s.r.settings.setMany({ 'send.dailyLimit': 0 })
    expect((await s.gate.authorize(s.user.id, s.c, s.conf())).ok).toBe(true)
  })
})

describe('redeem', () => {
  it('returns the confirmed content once; the second use is refused and the sealed content is gone', async () => {
    const s = await setup()
    const a = await authorize(s)
    const h = s.gate.hashNonce(a.nonce)
    s.advance(5000)
    const r = await s.gate.redeem(s.user.id, h)
    expect(r).toMatchObject({
      ok: true,
      value: { accountId: s.acc.id, content: { subject: 'Re: Q3', bodyText: 'Will do.' } },
    })
    expect(await s.gate.redeem(s.user.id, h)).toEqual({ ok: false, error: 'already_used' })
    expect(await s.r.secrets.getCiphertext(`send:${h}`)).toBeNull()
  })

  it('concurrent redeemers: exactly one wins', async () => {
    const s = await setup()
    const h = s.gate.hashNonce((await authorize(s)).nonce)
    const rs = await Promise.all(Array.from({ length: 8 }, () => s.gate.redeem(s.user.id, h)))
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    expect(
      rs
        .filter((r) => !r.ok)
        .every((r) => !r.ok && ['already_used', 'unknown_authorization'].includes(r.error)),
    ).toBe(true)
  })

  it('refuses unknown, expired, revoked, and other users’ authorizations', async () => {
    const s = await setup()
    expect(await s.gate.redeem(s.user.id, 'nope')).toEqual({
      ok: false,
      error: 'unknown_authorization',
    })
    const a = await authorize(s)
    const h = s.gate.hashNonce(a.nonce)
    expect(await s.gate.redeem(s.other.id, h)).toEqual({
      ok: false,
      error: 'unknown_authorization',
    })
    s.advance(5000 + VALIDITY_MS)
    expect(await s.gate.redeem(s.user.id, h)).toEqual({ ok: false, error: 'expired' })
    expect(await s.r.secrets.getCiphertext(`send:${h}`)).toBeNull()
    const b = await authorize(s)
    expect(await s.gate.revoke(s.user.id, b.nonce)).toBe(true)
    expect(await s.gate.redeem(s.user.id, s.gate.hashNonce(b.nonce))).toEqual({
      ok: false,
      error: 'revoked',
    })
  })

  it('a tampered stored content or a different expected content is refused', async () => {
    const s = await setup()
    const a = await authorize(s)
    const h = s.gate.hashNonce(a.nonce)
    expect(
      await s.gate.redeem(s.user.id, h, { ...s.c, bodyText: 'Send me your password' }),
    ).toEqual({ ok: false, error: 'content_changed' })
    // The caller proved nothing changed; still redeemable afterwards (refusal does not burn it).
    expect((await s.gate.redeem(s.user.id, h, { ...s.c, to: [...s.c.to].reverse() })).ok).toBe(true)
    const b = await authorize(s)
    const hb = s.gate.hashNonce(b.nonce)
    await secretStoreFor(s.db, s.user.id, s.ring).put(
      `send:${hb}`,
      JSON.stringify({ ...s.c, bodyText: 'tampered' }),
    )
    expect(await s.gate.redeem(s.user.id, hb)).toEqual({ ok: false, error: 'content_changed' })
  })

  it('a send whose confirming session has ended is revoked, not sent', async () => {
    const s = await setup()
    const a = await authorize(s)
    await s.db.execute(`update sessions set revoked_at = now() where id = '${s.sessionId}'`)
    s.advance(5000)
    const h = s.gate.hashNonce(a.nonce)
    expect(await s.gate.redeem(s.user.id, h)).toEqual({ ok: false, error: 'revoked' })
    expect((await s.r.send.getAuthorization(h))!.state).toBe('revoked')
  })

  it('undo after release is too late (false), and revoke is per user', async () => {
    const s = await setup()
    const a = await authorize(s)
    expect(await s.gate.revoke(s.other.id, a.nonce)).toBe(false)
    await s.gate.redeem(s.user.id, s.gate.hashNonce(a.nonce))
    expect(await s.gate.revoke(s.user.id, a.nonce)).toBe(false)
  })

  it('clamps the undo window to 0–30 seconds', async () => {
    const s = await setup()
    expect((await authorize(s, s.c, { undoSeconds: 0 })).releaseAt).toEqual(s.now())
    expect(
      (await authorize(s, s.c, { undoSeconds: 999 })).releaseAt.getTime() - s.now().getTime(),
    ).toBe(30_000)
  })
})
