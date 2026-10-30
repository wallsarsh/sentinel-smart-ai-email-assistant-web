import { safeFetch, safeStream } from '../http/safe-fetch'
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

export { failureForStatus } from '../../packages/core/src/ai/http'
