import { parseSse } from '#shared/sse-parser'
import type { WireFailure } from './failure-presenter'

export type DraftDone = {
  type: 'done'
  text: string
  placeholders: string[]
  foreign: { kind: string; value: string; start: number; end: number }[]
  promptVersion: string
  model: string
}
export type DraftStreamEvent =
  { type: 'delta'; text: string } | DraftDone | { type: 'error'; failure: WireFailure }

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
  json(): Promise<unknown>
}>

/**
 * Starts a draft and reports events as they arrive. Returns a handle whose
 * `stop()` aborts the request at once (the server then stops the model call).
 */
export function streamDraft(
  body: { messageId: string; tone: string; intent: string; instruction?: string },
  onEvent: (e: DraftStreamEvent) => void,
  o: { fetchFn?: FetchLike; csrf?: string } = {},
) {
  const ctl = new AbortController()
  const f: FetchLike = o.fetchFn ?? ((u, i) => fetch(u, i) as never)
  const finished = (async () => {
    try {
      const res = await f('/api/drafts/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(o.csrf ? { 'x-csrf-token': o.csrf } : {}),
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: { kind: WireFailure['kind']; detail?: Record<string, unknown> }
        }
        onEvent({ type: 'error', failure: j.error ?? { kind: 'unknown' } })
        return
      }
      for await (const ev of parseSse(res.body as unknown as AsyncIterable<Uint8Array>)) {
        if (ev.event === 'delta' || ev.event === 'done')
          onEvent(JSON.parse(ev.data) as DraftStreamEvent)
        else if (ev.event === 'error')
          onEvent({ type: 'error', failure: JSON.parse(ev.data).error ?? JSON.parse(ev.data) })
      }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return
      onEvent({ type: 'error', failure: { kind: 'network' } })
    }
  })()
  return { stop: () => ctl.abort(), finished }
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type SavedDraft = {
  text: string
  tone: string
  intent: string
  instruction: string
  to: string[]
  cc: string[]
  mode: 'reply' | 'reply_all'
}

/** Local autosave per message. Storage failures are ignored (the editor still works). */
export function draftStore(storage: StorageLike | null) {
  const key = (id: string) => `sentinel.draft.${id}`
  return {
    load(id: string): SavedDraft | null {
      try {
        const v = JSON.parse(storage?.getItem(key(id)) ?? 'null') as SavedDraft | null
        return v && typeof v.text === 'string' ? v : null
      } catch {
        return null
      }
    },
    save(id: string, d: SavedDraft) {
      try {
        storage?.setItem(key(id), JSON.stringify(d))
      } catch {
        /* private mode or full: keep editing */
      }
    },
    clear(id: string) {
      try {
        storage?.removeItem(key(id))
      } catch {
        /* ignore */
      }
    },
  }
}
