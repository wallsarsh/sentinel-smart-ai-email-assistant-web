import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { TokenSource } from '../oauth/token-source'

export const GRAPH = 'https://graph.microsoft.com/v1.0'
export type GraphResponse = { status: number; json: unknown; retryAfter?: number }
export type GraphCall = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  /** Path under /me, or an absolute graph.microsoft.com URL (delta links). */
  pathOrUrl: string,
  o?: {
    query?: Record<string, string | undefined>
    body?: unknown
    headers?: Record<string, string>
  },
) => Promise<GraphResponse>

export function graphFailure(res: GraphResponse): AppFailure {
  const code = String((res.json as { error?: { code?: string } })?.error?.code ?? '')
  if (res.status === 401) return { kind: 'auth', problem: 'needs_reauth' }
  if (res.status === 429 || (res.status === 503 && res.retryAfter))
    return { kind: 'rate_limited', retryAfterSeconds: res.retryAfter }
  if (res.status === 403)
    return {
      kind: 'auth',
      problem: /consent|AccessDenied/i.test(code) ? 'admin_consent_required' : 'consent_required',
      code,
    }
  if (res.status === 404) return { kind: 'not_found' }
  return { kind: 'provider', status: res.status, code: code || String(res.status) }
}

/** Only graph.microsoft.com may be called, including links read from responses. */
export const isGraphUrl = (u: string) => {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' && x.hostname === 'graph.microsoft.com'
  } catch {
    return false
  }
}

export function graphTransport(tokens: TokenSource, fetchFn: typeof fetch = fetch): GraphCall {
  return async (method, p, o = {}) => {
    const t = await tokens.accessToken()
    if (!t.ok) return { status: t.error.kind === 'auth' ? 401 : 599, json: null }
    const url = new URL(p.startsWith('https://') ? p : `${GRAPH}/me${p}`)
    if (!isGraphUrl(url.toString())) return { status: 400, json: null }
    for (const [k, v] of Object.entries(o.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, v)
    const res = await fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${t.value}`,
        ...(o.body ? { 'content-type': 'application/json' } : {}),
        ...o.headers,
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const ra = Number(res.headers.get('retry-after'))
    return {
      status: res.status,
      json: await res.json().catch(() => null),
      retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined,
    }
  }
}

export async function callGraph<T>(
  api: GraphCall,
  method: Parameters<GraphCall>[0],
  p: string,
  o?: Parameters<GraphCall>[2],
): Promise<Result<T, AppFailure>> {
  let res: GraphResponse
  try {
    res = await api(method, p, o)
  } catch {
    return err({ kind: 'network' })
  }
  if (res.status === 599) return err({ kind: 'network', code: 'token' })
  if (res.status >= 200 && res.status < 300) return ok(res.json as T)
  // 410 Gone = delta token expired; surfaced as a provider failure with this code.
  if (res.status === 410) return err({ kind: 'provider', status: 410, code: 'gone' })
  return err(graphFailure(res))
}
