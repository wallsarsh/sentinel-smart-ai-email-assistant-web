import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
] as const

/** Scopes without which the account cannot work; a user may untick others in the consent screen. */
const REQUIRED = GOOGLE_SCOPES.filter((s) => s.includes('gmail'))

export const OAUTH_COOKIE = 'sentinel_oauth_google'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const TTL_MS = 10 * 60_000

export type OAuthTokens = {
  refreshToken: string
  accessToken: string
  expiresAt: number
  scopes: string[]
}

export type GoogleProfile = { email: string; name: string; sub: string }

export class OAuthError extends Error {
  constructor(
    readonly code:
      | 'bad_state'
      | 'expired'
      | 'denied'
      | 'scope_missing'
      | 'no_refresh_token'
      | 'exchange_failed'
      | 'not_configured',
  ) {
    super(code)
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; json(): Promise<unknown> }>

export type GoogleOAuthDeps = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Server secret used to sign the state cookie. */
  secret: string
  fetch?: FetchLike
  now?: () => number
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const sign = (secret: string, v: string) =>
  createHmac('sha256', secret).update(`oauth-google:${v}`).digest('base64url')

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Authorization code + PKCE. The state cookie is signed, bound to the user and
 * short-lived, and holds the PKCE verifier; the `state` query value must match
 * the cookie, so a callback started elsewhere (CSRF / login CSRF) is rejected.
 */
export function googleOAuth(d: GoogleOAuthDeps) {
  const now = d.now ?? Date.now
  const doFetch: FetchLike =
    d.fetch ??
    ((url, init) => fetch(url, init).then((r) => ({ status: r.status, json: () => r.json() })))

  const configured = () =>
    d.clientId !== '' && (d.clientSecret !== '' || process.env.SENTINEL_DESKTOP_MODE === 'true')

  async function post(url: string, params: Record<string, string>) {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, body }
  }

  return {
    /** Returns the consent URL and the cookie value to set. */
    begin(userId: string, opts: { reconsentEmail?: string } = {}) {
      if (!configured()) throw new OAuthError('not_configured')
      const state = randomBytes(24).toString('base64url')
      const verifier = randomBytes(48).toString('base64url')
      const payload = b64(JSON.stringify({ s: state, v: verifier, u: userId, e: now() + TTL_MS }))
      const url = new URL(AUTH_URL)
      const q: Record<string, string> = {
        client_id: d.clientId,
        redirect_uri: d.redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        access_type: 'offline',
        // Always ask: Google only returns a refresh token on consent, and a
        // changed scope list needs a fresh grant.
        prompt: 'consent',
        include_granted_scopes: 'false',
      }
      if (opts.reconsentEmail) q.login_hint = opts.reconsentEmail
      for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
      return { url: url.toString(), cookie: `${payload}.${sign(d.secret, payload)}` }
    },

    /** Verifies state and exchanges the code. Never returns tokens for a different user. */
    async complete(input: {
      userId: string
      code: string | undefined
      state: string | undefined
      error?: string
      cookie: string | undefined
    }): Promise<{ tokens: OAuthTokens; profile: GoogleProfile }> {
      if (!configured()) throw new OAuthError('not_configured')
      const [payload, sig] = (input.cookie ?? '').split('.')
      if (!payload || !sig || !safeEqual(sig, sign(d.secret, payload)))
        throw new OAuthError('bad_state')
      let c: { s: string; v: string; u: string; e: number }
      try {
        c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      } catch {
        throw new OAuthError('bad_state')
      }
      if (c.u !== input.userId || !input.state || !safeEqual(c.s, input.state))
        throw new OAuthError('bad_state')
      if (c.e < now()) throw new OAuthError('expired')
      if (input.error) throw new OAuthError('denied')
      if (!input.code) throw new OAuthError('bad_state')

      const { status, body } = await post(TOKEN_URL, {
        code: input.code,
        client_id: d.clientId,
        ...(d.clientSecret ? { client_secret: d.clientSecret } : {}),
        redirect_uri: d.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: c.v,
      })
      if (status !== 200 || typeof body.access_token !== 'string')
        throw new OAuthError('exchange_failed')
      const scopes = String(body.scope ?? '')
        .split(' ')
        .filter(Boolean)
      if (!REQUIRED.every((s) => scopes.includes(s))) throw new OAuthError('scope_missing')
      if (typeof body.refresh_token !== 'string') throw new OAuthError('no_refresh_token')
      const profile = parseIdToken(body.id_token)
      if (!profile) throw new OAuthError('exchange_failed')
      return {
        profile,
        tokens: {
          refreshToken: body.refresh_token,
          accessToken: body.access_token,
          expiresAt: now() + Number(body.expires_in ?? 3600) * 1000,
          scopes,
        },
      }
    },

    /** True when the stored grant lacks a scope we now need (prompt re-consent). */
    needsReconsent: (t: Pick<OAuthTokens, 'scopes'>) =>
      !REQUIRED.every((s) => t.scopes.includes(s)),

    /** Exchanges the refresh token. `invalid_grant` means the user revoked access. */
    async refresh(
      t: OAuthTokens,
    ): Promise<{ ok: true; tokens: OAuthTokens } | { ok: false; reason: 'revoked' | 'transient' }> {
      const { status, body } = await post(TOKEN_URL, {
        client_id: d.clientId,
        ...(d.clientSecret ? { client_secret: d.clientSecret } : {}),
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
      })
      if (status === 200 && typeof body.access_token === 'string')
        return {
          ok: true,
          tokens: {
            ...t,
            accessToken: body.access_token,
            expiresAt: now() + Number(body.expires_in ?? 3600) * 1000,
          },
        }
      return { ok: false, reason: body.error === 'invalid_grant' ? 'revoked' : 'transient' }
    },

    /** Best effort: the account is disconnected locally even if Google is unreachable. */
    async revoke(t: Pick<OAuthTokens, 'refreshToken'>): Promise<boolean> {
      try {
        return (await post(REVOKE_URL, { token: t.refreshToken })).status === 200
      } catch {
        return false
      }
    },
  }
}

function parseIdToken(idToken: unknown): GoogleProfile | null {
  if (typeof idToken !== 'string') return null
  try {
    // Received directly from Google over TLS in the code exchange, so the
    // signature need not be re-verified (OIDC Core 3.1.3.7).
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
    if (typeof p.email !== 'string' || p.email_verified === false) return null
    return { email: p.email.toLowerCase(), name: String(p.name ?? ''), sub: String(p.sub ?? '') }
  } catch {
    return null
  }
}

export const oauthSecretName = (accountId: string) => `oauth:${accountId}`
