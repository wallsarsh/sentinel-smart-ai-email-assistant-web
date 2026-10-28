import { describe, expect, it } from 'vitest'
import {
  microsoftOAuth,
  MS_SCOPES,
  msGuidance,
  MsOAuthError,
} from '../../server/mail/oauth/microsoft'
import type { FetchLike } from '../../server/mail/oauth/google'

const idToken = (p: object) => `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`

function setup(body: Record<string, unknown> = {}, status = 200) {
  const calls: URLSearchParams[] = []
  const fetch: FetchLike = async (_u, init) => {
    calls.push(new URLSearchParams(init.body))
    return {
      status,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: MS_SCOPES.map((s) => s.replace('https://graph.microsoft.com/', '')).join(' '),
        id_token: idToken({ preferred_username: 'Me@Corp.com', name: 'Me', tid: 't1' }),
        ...body,
      }),
    }
  }
  const o = microsoftOAuth({
    clientId: 'c',
    clientSecret: 's',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: 'https://app/cb',
    secret: 'k'.repeat(32),
    fetch,
    now: () => 5000,
  })
  return { o, calls }
}
const st = (u: string) => new URL(u).searchParams.get('state')!

describe('microsoft oauth', () => {
  it('uses PKCE and offline access', () => {
    const u = new URL(setup().o.begin('u1').url)
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('scope')).toContain('offline_access')
    expect(u.searchParams.get('scope')).not.toContain('Mail.Send')
  })

  it('completes and normalises the email', async () => {
    const { o, calls } = setup()
    const b = o.begin('u1')
    const r = await o.complete({ userId: 'u1', code: 'c', state: st(b.url), cookie: b.cookie })
    expect(r.profile).toEqual({ email: 'me@corp.com', name: 'Me', tenantId: 't1' })
    expect(calls[0]!.get('code_verifier')).toBeTruthy()
  })

  it('rejects wrong state, other user and tampered cookie', async () => {
    const { o } = setup()
    const b = o.begin('u1')
    for (const a of [
      { userId: 'u1', state: 'x', cookie: b.cookie },
      { userId: 'u2', state: st(b.url), cookie: b.cookie },
      { userId: 'u1', state: st(b.url), cookie: 'A' + b.cookie },
    ])
      await expect(o.complete({ code: 'c', ...a })).rejects.toMatchObject({ code: 'bad_state' })
  })

  it('explains admin-consent and Conditional Access errors', async () => {
    expect(
      msGuidance('access_denied', 'AADSTS65001: The user or administrator has not consented'),
    ).toBe('admin_consent_required')
    expect(msGuidance('interaction_required', 'AADSTS53003: blocked by Conditional Access')).toBe(
      'conditional_access',
    )
    expect(msGuidance('x')).toBe('unknown')
    const { o } = setup()
    const b = o.begin('u1')
    await expect(
      o.complete({
        userId: 'u1',
        code: undefined,
        state: st(b.url),
        cookie: b.cookie,
        error: 'consent_required',
        errorDescription: 'AADSTS90094: admin consent',
      }),
    ).rejects.toMatchObject({ guidance: 'admin_consent_required' })
    const t = setup(
      { access_token: undefined, error: 'invalid_grant', error_description: 'AADSTS65001' },
      400,
    )
    const b2 = t.o.begin('u1')
    const err = await t.o
      .complete({ userId: 'u1', code: 'c', state: st(b2.url), cookie: b2.cookie })
      .catch((e) => e)
    expect(err).toBeInstanceOf(MsOAuthError)
    expect(err.guidance).toBe('admin_consent_required')
  })

  it('requires mail scopes and a refresh token', async () => {
    const s = setup({ scope: 'openid' })
    const b = s.o.begin('u1')
    await expect(
      s.o.complete({ userId: 'u1', code: 'c', state: st(b.url), cookie: b.cookie }),
    ).rejects.toMatchObject({ code: 'scope_missing' })
  })

  it('keeps the rotated refresh token and flags revoked grants', async () => {
    const t = { refreshToken: 'old', accessToken: '', expiresAt: 0, scopes: [] }
    const r = await setup({ refresh_token: 'new' }).o.refresh(t)
    expect(r.ok && r.tokens.refreshToken).toBe('new')
    const bad = await setup({ access_token: undefined, error: 'invalid_grant' }, 400).o.refresh(t)
    expect(bad).toMatchObject({ ok: false, reason: 'revoked' })
    const tr = await setup(
      { access_token: undefined, error: 'temporarily_unavailable' },
      503,
    ).o.refresh(t)
    expect(tr).toMatchObject({ ok: false, reason: 'transient' })
  })
})
