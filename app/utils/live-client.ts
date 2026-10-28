export type EventSourceLike = {
  readyState: number
  onopen: ((e: unknown) => void) | null
  onerror: ((e: unknown) => void) | null
  addEventListener(type: string, fn: (e: { data: string; lastEventId?: string }) => void): void
  close(): void
}

export type LiveStatus = 'connecting' | 'open' | 'offline'
type Handler = (data: Record<string, unknown>) => void

const CLOSED = 2

/**
 * Subscribes to the server's event stream. Dedupes replayed events by id,
 * rebuilds the connection with backoff when the browser gives up, and calls
 * `onResync` after an outage so views reload what they may have missed (the
 * server only buffers recent events).
 */
export function createLiveClient(o: {
  open: () => EventSourceLike
  types: string[]
  onStatus?: (s: LiveStatus) => void
  onResync?: () => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}) {
  const handlers = new Map<string, Set<Handler>>()
  const seen = new Set<number>()
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  let es: EventSourceLike | null = null
  let retry: unknown = null
  let attempt = 0
  let wasDown = false
  let stopped = true

  const status = (s: LiveStatus) => o.onStatus?.(s)

  function connect() {
    status('connecting')
    const src = (es = o.open())
    src.onopen = () => {
      attempt = 0
      status('open')
      if (wasDown) o.onResync?.()
      wasDown = false
    }
    src.onerror = () => {
      wasDown = true
      status('offline')
      // EventSource retries by itself unless it is closed; then we rebuild it.
      if (src.readyState === CLOSED && !stopped) {
        src.close()
        retry = setTimer(connect, Math.min(1000 * 2 ** attempt++, 30_000))
      }
    }
    for (const type of o.types)
      src.addEventListener(type, (e) => {
        const id = Number(e.lastEventId)
        if (Number.isFinite(id) && id > 0) {
          if (seen.has(id)) return
          seen.add(id)
          if (seen.size > 500) seen.delete(seen.values().next().value as number)
        }
        let data: Record<string, unknown>
        try {
          data = JSON.parse(e.data) as Record<string, unknown>
        } catch {
          return
        }
        for (const h of handlers.get(type) ?? []) h(data)
      })
  }

  return {
    on(type: string, h: Handler) {
      const set = handlers.get(type) ?? new Set()
      handlers.set(type, set)
      set.add(h)
      return () => void set.delete(h)
    },
    start() {
      if (!stopped) return
      stopped = false
      connect()
    },
    stop() {
      stopped = true
      if (retry) clearTimer(retry)
      es?.close()
      es = null
    },
  }
}
