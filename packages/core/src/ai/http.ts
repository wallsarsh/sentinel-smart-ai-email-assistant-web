import type { AppFailure } from '../errors/failure'
import type { AiHttp } from './types'

/** Plain `fetch` transport, for the browser and the Thunderbird extension. The server uses its SSRF-guarded one. */
export const fetchHttp = (fetchImpl: typeof fetch = (...a) => fetch(...a)): AiHttp => ({
  async request(url, o) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 60_000)
    o.signal?.addEventListener('abort', () => ctl.abort())
    try {
      const res = await fetchImpl(url, {
        method: o.method ?? 'POST',
        headers: o.headers,
        body: o.body,
        signal: ctl.signal,
      })
      return { status: res.status, headers: res.headers, text: await res.text() }
    } finally {
      clearTimeout(timer)
    }
  },
  async stream(url, o) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: o.headers,
      body: o.body,
      signal: o.signal,
    })
    return {
      status: res.status,
      headers: res.headers,
      body: (res.body ?? new ReadableStream()) as unknown as AsyncIterable<Uint8Array>,
      text: () => res.text().catch(() => ''),
      close: () => void res.body?.cancel().catch(() => undefined),
    }
  },
})

/** Maps an error status to our failure kinds. Never keeps the provider's message. */
export function failureForStatus(status: number, retryAfter?: string | null): AppFailure {
  if (status === 401 || status === 403)
    return { kind: 'auth', problem: 'invalid_credentials', code: String(status) }
  if (status === 404) return { kind: 'not_found' }
  if (status === 429) {
    const s = Number(retryAfter)
    return { kind: 'rate_limited', retryAfterSeconds: Number.isFinite(s) && s > 0 ? s : undefined }
  }
  return { kind: 'provider', status, code: String(status) }
}
