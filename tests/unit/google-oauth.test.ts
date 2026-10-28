import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { authRepo } from '../../server/repos/auth'
import {
  GOOGLE_SCOPES,
  googleOAuth,
  OAuthError,
  type FetchLike,
} from '../../server/mail/oauth/google'
import { loadTokens, saveGoogleAccount } from '../../server/mail/oauth/connect'
import { secretStoreFor } from '../../server/security/secret-store'
import { randomBytes } from 'node:crypto'

const idToken = (p: object) => `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`

function setup(over: Partial<Record<string, unknown>> = {}, status = 200) {
  const calls: { url: string; body: URLSearchParams }[] = []
  let t = 1_000_000
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) })
    if (url.endsWith('/revoke')) return { status, json: async () => ({}) }
    return {
      status,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: GOOGLE_SCOPES.join(' '),
        id_token: idToken({ email: 'Me@Gmail.com', email_verified: true, name: 'Me', sub: '1' }),
        ...over,
      }),
    }
  }
  const o = googleOAuth({
    clientId: 'cid',
    clientSecret: 'sec',
    redirectUri: 'https://app/cb',
    secret: 's'.repeat(32),
    fetch,
    now: () => t,
  })
  return { o, calls, advance: (ms: number) => (t += ms) }
}

const stateOf = (url: string) => new URL(url).searchParams.get('state')!

describe('google oauth', () => {
  it('builds a PKCE consent URL asking for offline access and no send scope', () => {
    const { o } = setup()
    const u = new URL(o.begin('u1').url)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('scope')).not.toContain('gmail.send')
  })

  it('completes with the verifier and returns profile and tokens', async () => {
    const { o, calls } = setup()
    const b = o.begin('u1')
    const r = await o.complete({ userId: 'u1', code: 'c', state: stateOf(b.url), cookie: b.cookie })
    expect(r.profile.email).toBe('me@gmail.com')
    expect(r.tokens.refreshToken).toBe('rt')
    expect(calls[0]!.body.get('code_verifier')!.length).toBeGreaterThan(40)
  })

  it.each([
    [
      'wrong state',
      (b: { url: string; cookie: string }) => ({ state: 'nope', cookie: b.cookie, userId: 'u1' }),
    ],
    [
      'other user',
      (b: { url: string; cookie: string }) => ({
        state: stateOf(b.url),
        cookie: b.cookie,
        userId: 'u2',
      }),
    ],
    [
      'tampered cookie',
      (b: { url: string; cookie: string }) => ({
        state: stateOf(b.url),
        cookie: 'A' + b.cookie,
        userId: 'u1',
      }),
    ],
    [
      'missing cookie',
      (b: { url: string; cookie: string }) => ({
        state: stateOf(b.url),
        cookie: undefined,
        userId: 'u1',
      }),
    ],
  ])('rejects %s', async (_n, f) => {
    const { o } = setup()
    const b = o.begin('u1')
    await expect(o.complete({ code: 'c', ...f(b) })).rejects.toMatchObject({ code: 'bad_state' })
  })

  it('rejects an expired flow and a denied consent', async () => {
    const { o, advance } = setup()
    const b = o.begin('u1')
    await expect(
      o.complete({
        userId: 'u1',
        code: 'c',
        state: stateOf(b.url),
        cookie: b.cookie,
        error: 'access_denied',
      }),
    ).rejects.toMatchObject({ code: 'denied' })
    advance(11 * 60_000)
    await expect(
      o.complete({ userId: 'u1', code: 'c', state: stateOf(b.url), cookie: b.cookie }),
    ).rejects.toMatchObject({ code: 'expired' })
  })

  it('requires the mail scopes and a refresh token', async () => {
    let s = setup({ scope: 'openid email' })
    let b = s.o.begin('u1')
    await expect(
      s.o.complete({ userId: 'u1', code: 'c', state: stateOf(b.url), cookie: b.cookie }),
    ).rejects.toMatchObject({ code: 'scope_missing' })
    s = setup({ refresh_token: undefined })
    b = s.o.begin('u1')
    await expect(
      s.o.complete({ userId: 'u1', code: 'c', state: stateOf(b.url), cookie: b.cookie }),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('detects when a stored grant needs re-consent', () => {
    const { o } = setup()
    expect(o.needsReconsent({ scopes: ['openid'] })).toBe(true)
    expect(o.needsReconsent({ scopes: [...GOOGLE_SCOPES] })).toBe(false)
  })

  it('refresh distinguishes revoked from transient', async () => {
    const t = { refreshToken: 'rt', accessToken: 'a', expiresAt: 0, scopes: [] }
    expect(await setup({ access_token: 'new' }).o.refresh(t)).toMatchObject({ ok: true })
    expect(
      await setup({ error: 'invalid_grant', access_token: undefined }, 400).o.refresh(t),
    ).toEqual({ ok: false, reason: 'revoked' })
    expect(await setup({ error: 'x', access_token: undefined }, 500).o.refresh(t)).toEqual({
      ok: false,
      reason: 'transient',
    })
  })

  it('is unusable until configured', () => {
    const o = googleOAuth({ clientId: '', clientSecret: '', redirectUri: 'x', secret: 's' })
    expect(() => o.begin('u')).toThrow(OAuthError)
  })
})

describe('saving the account', () => {
  it('stores tokens only in the encrypted secret store and reuses the account on reconnect', async () => {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const ring = { current: { version: 1, key: randomBytes(32) } }
    const tokens = { refreshToken: 'RT-secret', accessToken: 'a', expiresAt: 1, scopes: [] }
    const p = { email: 'me@gmail.com', name: 'Me', sub: '1' }
    const a = await saveGoogleAccount(db, ring, user.id, p, tokens)
    const b = await saveGoogleAccount(db, ring, user.id, p, { ...tokens, refreshToken: 'RT2' })
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(b.account.id).toBe(a.account.id)
    expect((await loadTokens(db, ring, user.id, a.account.id))!.refreshToken).toBe('RT2')
    expect(JSON.stringify(a.account)).not.toContain('RT-secret')
    expect(await secretStoreFor(db, user.id, ring).get('oauth:' + a.account.id)).toContain('RT2')
  })
})
