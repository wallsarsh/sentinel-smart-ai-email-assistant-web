import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { saveGoogleAccount } from '../../server/mail/oauth/connect'
import { tokenSource } from '../../server/mail/oauth/token-source'

async function setup(expiresAt: number) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const ring = { current: { version: 1, key: randomBytes(32) } }
  const { account } = await saveGoogleAccount(
    db,
    ring,
    user.id,
    { email: 'me@gmail.com', name: 'Me', sub: '1' },
    { refreshToken: 'rt', accessToken: 'old', expiresAt, scopes: [] },
  )
  return { db, ring, user, account }
}

describe('tokenSource', () => {
  it('returns the cached token while valid', async () => {
    const s = await setup(10_000_000)
    let calls = 0
    const ts = tokenSource({
      ...s,
      userId: s.user.id,
      accountId: s.account.id,
      now: () => 0,
      refresher: async () => (calls++, { ok: false, reason: 'transient' }),
    })
    expect(await ts.accessToken()).toEqual({ ok: true, value: 'old' })
    expect(calls).toBe(0)
  })

  it('refreshes once for concurrent callers and persists the rotation', async () => {
    const s = await setup(0)
    let calls = 0
    const refresher = async (t: { refreshToken: string }) => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return {
        ok: true as const,
        tokens: { refreshToken: 'rt2', accessToken: 'new', expiresAt: 9e9, scopes: [] },
        _: t,
      }
    }
    const mk = () =>
      tokenSource({ ...s, userId: s.user.id, accountId: s.account.id, now: () => 1000, refresher })
    const [a, b] = await Promise.all([mk().accessToken(), mk().accessToken()])
    expect(a).toEqual({ ok: true, value: 'new' })
    expect(b).toEqual(a)
    expect(calls).toBe(1)
    const again = await mk().accessToken()
    expect(again).toEqual({ ok: true, value: 'new' })
    expect(calls).toBe(1)
  })

  it('marks the account needs_reauth when revoked, keeps it active on transient errors', async () => {
    const s = await setup(0)
    const run = (reason: 'revoked' | 'transient') =>
      tokenSource({
        ...s,
        userId: s.user.id,
        accountId: s.account.id,
        now: () => 1000,
        refresher: async () => ({ ok: false, reason }),
      }).accessToken()
    expect(await run('transient')).toEqual({
      ok: false,
      error: { kind: 'network', code: 'token_refresh' },
    })
    expect((await forUser(s.db, s.user.id).accounts.get(s.account.id))!.status).toBe('active')
    expect(await run('revoked')).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'needs_reauth' },
    })
    expect((await forUser(s.db, s.user.id).accounts.get(s.account.id))!.status).toBe('needs_reauth')
  })

  it('reports needs_reauth when no tokens are stored', async () => {
    const s = await setup(0)
    const other = tokenSource({
      ...s,
      userId: s.user.id,
      accountId: '00000000-0000-0000-0000-000000000000',
      refresher: async () => ({ ok: false, reason: 'transient' }),
    })
    expect(await other.accessToken()).toMatchObject({
      ok: false,
      error: { problem: 'needs_reauth' },
    })
  })
})
