import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { OAuthError, type FetchLike, type OAuthTokens } from './google'

export const MS_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
] as const
const REQUIRED = ['Mail.Read', 'Mail.ReadWrite']

export const MS_OAUTH_COOKIE = 'sentinel_oauth_ms'
const TTL_MS = 10 * 60_000

export type MsProfile = { email: string; name: string; tenantId: string }

/** What the UI shows when sign-in fails for an organisation-policy reason. */
export type MsGuidance =
  'admin_consent_required' | 'conditional_access' | 'tenant_blocked' | 'unknown'

/** Maps an AADSTS error to guidance; admin consent is the common case for work accounts. */
export function msGuidance(error: string | undefined, description = ''): MsGuidance {
  const text = `${error ?? ''} ${description}`
  if (/AADSTS(65001|90094|90095|65004)|consent_required|admin.*consent/i.test(text))
    return 'admin_consent_required'
  if (/AADSTS(50076|50079|53000|53003|50158)/.test(text)) return 'conditional_access'
  if (/AADSTS(700016|50020|530032|50105)/.test(text)) return 'tenant_blocked'
  return 'unknown'
}

export class MsOAuthError extends OAuthError {
  constructor(
    code: ConstructorParameters<typeof OAuthError>[0],
    readonly guidance: MsGuidance = 'unknown',
  ) {
    super(code)
  }
}

export type MicrosoftOAuthDeps = {
  clientId: string
  clientSecret: string
  /** e.g. https://login.microsoftonline.com/common or a tenant id. */
  authority: string
  redirectUri: string
  secret: string
  fetch?: FetchLike
  now?: () => number
}

const sign = (secret: string, v: string) =>
  createHmac('sha256', secret).update(`oauth-ms:${v}`).digest('base64url')
const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function microsoftOAuth(d: MicrosoftOAuthDeps) {
  const now = d.now ?? Date.now
  const doFetch: FetchLike =
    d.fetch ?? ((u, i) => fetch(u, i).then((r) => ({ status: r.status, json: () => r.json() })))
  const base = d.authority.replace(/\/$/, '')
  const configured = () => d.clientId !== '' && d.clientSecret !== ''

  async function post(url: string, params: Record<string, string>) {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    return {
      status: res.status,
      body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    }
  }

  return {
    begin(userId: string, opts: { loginHint?: string; adminConsent?: boolean } = {}) {
      if (!configured()) throw new OAuthError('not_configured')
      const state = randomBytes(24).toString('base64url')
      const verifier = randomBytes(48).toString('base64url')
      const payload = Buffer.from(
        JSON.stringify({ s: state, v: verifier, u: userId, e: now() + TTL_MS }),
      ).toString('base64url')
      const url = new URL(`${base}/oauth2/v2.0/authorize`)
      const q: Record<string, string> = {
        client_id: d.clientId,
        response_type: 'code',
        redirect_uri: d.redirectUri,
        response_mode: 'query',
        scope: MS_SCOPES.join(' '),
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        // select_account lets users with several work/personal logins pick one;
        // MFA and Conditional Access run on Microsoft's pages.
        prompt: 'select_account',
      }
      if (opts.loginHint) q.login_hint = opts.loginHint
      for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
      return { url: url.toString(), cookie: `${payload}.${sign(d.secret, payload)}` }
    },

    async complete(input: {
      userId: string
      code: string | undefined
      state: string | undefined
      error?: string
      errorDescription?: string
      cookie: string | undefined
    }): Promise<{ tokens: OAuthTokens; profile: MsProfile }> {
      if (!configured()) throw new OAuthError('not_configured')
      const [payload, sig] = (input.cookie ?? '').split('.')
      if (!payload || !sig || !same(sig, sign(d.secret, payload))) throw new OAuthError('bad_state')
      let c: { s: string; v: string; u: string; e: number }
      try {
        c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      } catch {
        throw new OAuthError('bad_state')
      }
      if (c.u !== input.userId || !input.state || !same(c.s, input.state))
        throw new OAuthError('bad_state')
      if (c.e < now()) throw new OAuthError('expired')
      if (input.error) {
        const g = msGuidance(input.error, input.errorDescription)
        throw new MsOAuthError(g === 'unknown' ? 'denied' : 'denied', g)
      }
      if (!input.code) throw new OAuthError('bad_state')

      const { status, body } = await post(`${base}/oauth2/v2.0/token`, {
        client_id: d.clientId,
        client_secret: d.clientSecret,
        code: input.code,
        redirect_uri: d.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: c.v,
        scope: MS_SCOPES.join(' '),
      })
      if (status !== 200 || typeof body.access_token !== 'string')
        throw new MsOAuthError(
          'exchange_failed',
          msGuidance(String(body.error ?? ''), String(body.error_description ?? '')),
        )
      const scopes = String(body.scope ?? '')
        .split(' ')
        .map((s) => s.replace('https://graph.microsoft.com/', ''))
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

    needsReconsent: (t: Pick<OAuthTokens, 'scopes'>) =>
      !REQUIRED.every((s) => t.scopes.includes(s)),

    /** Microsoft rotates refresh tokens; the new one replaces the stored one. */
    async refresh(
      t: OAuthTokens,
    ): Promise<
      | { ok: true; tokens: OAuthTokens }
      | { ok: false; reason: 'revoked' | 'transient'; guidance: MsGuidance }
    > {
      const { status, body } = await post(`${base}/oauth2/v2.0/token`, {
        client_id: d.clientId,
        client_secret: d.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
        scope: MS_SCOPES.join(' '),
      })
      if (status === 200 && typeof body.access_token === 'string')
        return {
          ok: true,
          tokens: {
            ...t,
            accessToken: body.access_token,
            refreshToken:
              typeof body.refresh_token === 'string' ? body.refresh_token : t.refreshToken,
            expiresAt: now() + Number(body.expires_in ?? 3600) * 1000,
          },
        }
      const guidance = msGuidance(String(body.error ?? ''), String(body.error_description ?? ''))
      const revoked = body.error === 'invalid_grant' || guidance !== 'unknown'
      return { ok: false, reason: revoked ? 'revoked' : 'transient', guidance }
    },
  }
}

function parseIdToken(idToken: unknown): MsProfile | null {
  if (typeof idToken !== 'string') return null
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
    const email = String(p.email ?? p.preferred_username ?? '').toLowerCase()
    if (!email.includes('@')) return null
    return { email, name: String(p.name ?? ''), tenantId: String(p.tid ?? '') }
  } catch {
    return null
  }
}
