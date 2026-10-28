import type { AiHttp } from '../../server/ai/types'

export type Seen = { url: string; headers: Record<string, string>; body?: string }

/** Scripted HTTP for adapter tests: queue replies, inspect what was sent. */
export function fakeAiHttp(
  replies: {
    status?: number
    text?: string
    headers?: Record<string, string>
    chunks?: string[]
  }[],
) {
  const seen: Seen[] = []
  const queue = [...replies]
  const http: AiHttp = {
    async request(url, o) {
      seen.push({ url, headers: o.headers, body: o.body })
      const r = queue.shift() ?? { status: 500, text: '' }
      return { status: r.status ?? 200, headers: new Headers(r.headers), text: r.text ?? '' }
    },
    async stream(url, o) {
      seen.push({ url, headers: o.headers, body: o.body })
      const r = queue.shift() ?? { status: 500, text: '' }
      const enc = new TextEncoder()
      let closed = false
      const chunks = r.chunks ?? [r.text ?? '']
      return {
        status: r.status ?? 200,
        headers: new Headers(r.headers),
        body: (async function* () {
          for (const c of chunks) {
            if (closed || o.signal?.aborted) return
            yield enc.encode(c)
          }
        })(),
        text: async () => r.text ?? chunks.join(''),
        close: () => void (closed = true),
      }
    },
  }
  return { http, seen }
}
