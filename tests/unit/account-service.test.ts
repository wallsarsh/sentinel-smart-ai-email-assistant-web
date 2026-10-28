import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { accountService, ACCOUNT_LIMIT, type AccountDeps } from '../../server/accounts/service'
import { createTestDb } from '../../server/db/client'
import { saveGoogleAccount } from '../../server/mail/oauth/connect'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { secretStoreFor } from '../../server/security/secret-store'
import { err, ok } from '../../shared/errors/result'
import { FakeMailProvider } from '../helpers/fake-mail-provider'

async function setup(over: Partial<AccountDeps> = {}) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const ring = { current: { version: 1, key: randomBytes(32) } }
  const revoked: string[] = []
  const svc = accountService({
    db,
    ring,
    imapProvider: async () => new FakeMailProvider(),
    smtpTest: async () => ok(undefined),
    revoke: async (t) => void revoked.push(t),
    ...over,
  })
  return { db, user, other, ring, svc, revoked }
}

const input = (email = 'me@corp.test') => ({
  email,
  password: 'pw-secret',
  settings: {
    imapHost: 'imap.corp.test',
    imapPort: 993,
    imapSecurity: 'implicit_tls',
    username: email,
    smtpHost: 'smtp.corp.test',
    smtpPort: 465,
    smtpSecurity: 'implicit_tls',
  },
})

describe('account service', () => {
  it('adds an IMAP account, keeps the password only in the secret store, and lists folders', async () => {
    const s = await setup()
    const r = await s.svc.addImap(s.user.id, input())
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(JSON.stringify(r.value)).not.toContain('pw-secret')
    expect(await secretStoreFor(s.db, s.user.id, s.ring).get(`imap:${r.value.id}`)).toBe(
      'pw-secret',
    )
    const f = await s.svc.folders(s.user.id, r.value.id)
    expect(f.ok && f.value.map((x) => x.providerId)).toEqual(['INBOX'])
    expect((await forUser(s.db, s.user.id).accounts.getImap(r.value.id))!.imapHost).toBe(
      'imap.corp.test',
    )
  })

  it('does not save when credentials fail', async () => {
    const bad = new FakeMailProvider()
    bad.failNext = { kind: 'auth', problem: 'invalid_credentials' }
    const s = await setup({ imapProvider: async () => bad })
    expect(await s.svc.addImap(s.user.id, input())).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'invalid_credentials' },
    })
    expect(await s.svc.list(s.user.id)).toEqual([])
    const s2 = await setup({
      smtpTest: async () => err({ kind: 'auth', problem: 'invalid_credentials', code: 'smtp' }),
    })
    expect((await s2.svc.addImap(s2.user.id, input())).ok).toBe(false)
    expect(await s2.svc.list(s2.user.id)).toEqual([])
  })

  it('validates input, duplicates and the account limit', async () => {
    const s = await setup()
    expect(await s.svc.addImap(s.user.id, { ...input(), email: 'nope' })).toMatchObject({
      ok: false,
      error: { kind: 'validation', field: 'email' },
    })
    expect(
      await s.svc.addImap(s.user.id, {
        ...input(),
        settings: { ...input().settings, imapPort: 0 },
      }),
    ).toMatchObject({ ok: false, error: { kind: 'validation' } })
    await s.svc.addImap(s.user.id, input('a@corp.test'))
    expect(await s.svc.addImap(s.user.id, input('A@corp.test'))).toMatchObject({
      error: { code: 'already_connected' },
    })
    for (let i = 1; i < ACCOUNT_LIMIT; i++) await s.svc.addImap(s.user.id, input(`u${i}@corp.test`))
    expect(await s.svc.addImap(s.user.id, input('extra@corp.test'))).toMatchObject({
      error: { code: 'limit_reached' },
    })
  })

  it('updates only allowed fields, per user', async () => {
    const s = await setup()
    const a = await s.svc.addImap(s.user.id, input())
    if (!a.ok) throw new Error('x')
    const u = await s.svc.update(s.user.id, a.value.id, { aiExcluded: true, displayName: 'Work' })
    expect(u.ok && [u.value.aiExcluded, u.value.displayName]).toEqual([true, 'Work'])
    expect(await s.svc.update(s.other.id, a.value.id, { aiExcluded: false })).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(await s.svc.update(s.user.id, a.value.id, { aiExcluded: 'yes' })).toMatchObject({
      ok: false,
    })
  })

  it('chooses processed folders and rejects unknown ones', async () => {
    const s = await setup()
    const a = await s.svc.addImap(s.user.id, input())
    if (!a.ok) throw new Error('x')
    expect((await s.svc.chooseFolders(s.user.id, a.value.id, [])).ok).toBe(true)
    expect(
      ((await s.svc.folders(s.user.id, a.value.id)) as { value: { processed: boolean }[] })
        .value[0]!.processed,
    ).toBe(false)
    expect(await s.svc.chooseFolders(s.user.id, a.value.id, ['nope'])).toMatchObject({
      error: { code: 'unknown_folder' },
    })
    expect(await s.svc.chooseFolders(s.other.id, a.value.id, ['INBOX'])).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
  })

  it('removal revokes the grant, deletes secrets and the account', async () => {
    const s = await setup()
    const { account } = await saveGoogleAccount(
      s.db,
      s.ring,
      s.user.id,
      { email: 'me@gmail.com', name: 'Me', sub: '1' },
      { refreshToken: 'RT', accessToken: 'a', expiresAt: 1, scopes: [] },
    )
    expect(await s.svc.remove(s.other.id, account.id)).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect((await s.svc.remove(s.user.id, account.id)).ok).toBe(true)
    expect(s.revoked).toHaveLength(1)
    expect(await s.svc.list(s.user.id)).toEqual([])
    expect(await secretStoreFor(s.db, s.user.id, s.ring).get(`oauth:${account.id}`)).toBeNull()
  })
})
