import { describe, expect, it } from 'vitest'
import {
  createLiveClient,
  type EventSourceLike,
  type LiveStatus,
} from '../../app/utils/live-client'

class FakeES implements EventSourceLike {
  readyState = 0
  onopen: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  listeners = new Map<string, (e: { data: string; lastEventId?: string }) => void>()
  closed = false
  addEventListener(t: string, fn: (e: { data: string; lastEventId?: string }) => void) {
    this.listeners.set(t, fn)
  }
  close() {
    this.closed = true
  }
  emit(type: string, id: number, data: object | string) {
    this.listeners.get(type)?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
      lastEventId: String(id),
    })
  }
}

function setup() {
  const sources: FakeES[] = []
  const statuses: LiveStatus[] = []
  const timers: { fn: () => void; ms: number }[] = []
  let resyncs = 0
  const c = createLiveClient({
    open: () => {
      const s = new FakeES()
      sources.push(s)
      return s
    },
    types: ['inbox.changed'],
    onStatus: (s) => statuses.push(s),
    onResync: () => resyncs++,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => undefined,
  })
  return { c, sources, statuses, timers, resyncs: () => resyncs }
}

describe('live client', () => {
  it('delivers events and drops replayed duplicates', () => {
    const s = setup()
    const got: unknown[] = []
    s.c.on('inbox.changed', (d) => got.push(d))
    s.c.start()
    s.sources[0]!.emit('inbox.changed', 5, { n: 1 })
    s.sources[0]!.emit('inbox.changed', 5, { n: 1 })
    s.sources[0]!.emit('inbox.changed', 6, { n: 2 })
    s.sources[0]!.emit('inbox.changed', 7, 'not json')
    expect(got).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('reconnects with growing backoff after the browser closes the stream, then resyncs', () => {
    const s = setup()
    s.c.start()
    const first = s.sources[0]!
    first.readyState = 2
    first.onerror?.({})
    expect(s.timers[0]!.ms).toBe(1000)
    expect(first.closed).toBe(true)
    s.timers[0]!.fn()
    const second = s.sources[1]!
    second.readyState = 2
    second.onerror?.({})
    expect(s.timers[1]!.ms).toBe(2000)
    s.timers[1]!.fn()
    s.sources[2]!.onopen?.({})
    expect(s.statuses.at(-1)).toBe('open')
    expect(s.resyncs()).toBe(1)
    s.sources[2]!.onopen?.({})
    expect(s.resyncs()).toBe(1)
  })

  it('lets the browser retry transient errors without rebuilding', () => {
    const s = setup()
    s.c.start()
    s.sources[0]!.readyState = 0
    s.sources[0]!.onerror?.({})
    expect(s.timers).toHaveLength(0)
    expect(s.statuses.at(-1)).toBe('offline')
  })

  it('stop closes the stream and is final; handlers can be removed', () => {
    const s = setup()
    const got: unknown[] = []
    const off = s.c.on('inbox.changed', (d) => got.push(d))
    s.c.start()
    off()
    s.sources[0]!.emit('inbox.changed', 1, {})
    expect(got).toEqual([])
    s.c.stop()
    expect(s.sources[0]!.closed).toBe(true)
    s.sources[0]!.readyState = 2
    s.sources[0]!.onerror?.({})
    expect(s.timers).toHaveLength(0)
  })
})
