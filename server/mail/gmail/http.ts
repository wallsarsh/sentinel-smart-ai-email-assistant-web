import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { TokenSource } from '../oauth/token-source'

export type ApiResponse = { status: number; json: unknown; retryAfter?: number }
export type ApiCall = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  o?: { query?: Record<string, string | string[] | undefined>; body?: unknown },
) => Promise<ApiResponse>

/** Maps an HTTP status from a Google API to our failure kinds (no provider text is kept). */
export function failureFor(res: ApiResponse): AppFailure {
  const reason = String(
    (res.json as { error?: { errors?: { reason?: string }[]; status?: string } })?.error
      ?.errors?.[0]?.reason ?? '',
  )
  if (res.status === 401) return { kind: 'auth', problem: 'needs_reauth' }
  if (res.status === 404) return { kind: 'not_found' }
  if (res.status === 429 || /rateLimit|userRateLimit|quota/i.test(reason))
    return { kind: 'rate_limited', retryAfterSeconds: res.retryAfter }
  if (res.status === 403)
    return { kind: 'auth', problem: 'consent_required', code: reason || '403' }
  return { kind: 'provider', status: res.status, code: reason || String(res.status) }
}

/** Production transport: bearer token from the token source, JSON in and out. */
export function googleTransport(tokens: TokenSource, fetchFn: typeof fetch = fetch): ApiCall {
  return async (method, path, o = {}) => {
    const t = await tokens.accessToken()
    if (!t.ok) return { status: t.error.kind === 'auth' ? 401 : 599, json: null }
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`)
    for (const [k, v] of Object.entries(o.query ?? {}))
      for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v])
        url.searchParams.append(k, x)
    const res = await fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${t.value}`,
        ...(o.body ? { 'content-type': 'application/json' } : {}),
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

/** Runs a call and turns transport exceptions and error statuses into Result. */
export async function call<T>(
  api: ApiCall,
  method: Parameters<ApiCall>[0],
  path: string,
  o?: Parameters<ApiCall>[2],
): Promise<Result<T, AppFailure>> {
  let res: ApiResponse
  try {
    res = await api(method, path, o)
  } catch {
    return err({ kind: 'network' })
  }
  if (res.status === 599) return err({ kind: 'network', code: 'token' })
  if (res.status >= 200 && res.status < 300) return ok(res.json as T)
  return err(failureFor(res))
}
