import { safeFetch, safeStream } from '../http/safe-fetch'
import type { AppFailure } from '../../shared/errors/failure'
import type { AiHttp } from './types'

/** Default transport: public https hosts only (the user supplies base URLs). */
export const guardedHttp = (opts: { allowHttp?: boolean } = {}): AiHttp => ({
  async request(url, o) {
    return safeFetch(url, {
      method: o.method ?? 'POST',
      headers: o.headers,
      body: o.body,
      timeoutMs: o.timeoutMs ?? 60_000,
      maxBytes: 4_000_000,
      retries: 0,
      policy: opts,
    })
  },
  async stream(url, o) {
    const s = await safeStream(url, {
      method: 'POST',
      headers: o.headers,
      body: o.body,
      signal: o.signal,
      policy: opts,
    })
    return {
      status: s.status,
      headers: s.headers,
      body: (s.body ?? new ReadableStream()) as unknown as AsyncIterable<Uint8Array>,
      async text() {
        const t = await new Response(s.body).text().catch(() => '')
        s.close()
        return t
      },
      close: s.close,
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
