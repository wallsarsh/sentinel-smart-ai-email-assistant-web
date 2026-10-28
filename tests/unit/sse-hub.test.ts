import { describe, expect, it } from 'vitest'
import { EventHub, MAX_PAYLOAD_BYTES, type Bridge, type StoredEvent } from '../../server/sse/hub'

function memoryBus() {
  const handlers: ((u: string, e: StoredEvent) => void)[] = []
  const bridge = (): Bridge => ({
    onMessage: (h) => void handlers.push(h),
    publish: async (u, e) => void handlers.forEach((h) => h(u, e)),
  })
  return { bridge }
}

describe('EventHub', () => {
  it('delivers only to the right user', async () => {
    const hub = new EventHub()
    const a: string[] = []
    const b: string[] = []
    hub.subscribe('a', (e) => a.push(e.type))
    hub.subscribe('b', (e) => b.push(e.type))
    await hub.publish('a', { type: 'inbox', data: {} })
    expect([a, b]).toEqual([['inbox'], []])
  })

  it('unsubscribe stops delivery and frees the entry', async () => {
    const hub = new EventHub()
    const got: string[] = []
    const off = hub.subscribe('a', (e) => got.push(e.type))
    off()
    await hub.publish('a', { type: 'x', data: {} })
    expect(got).toEqual([])
    expect(hub.subscriberCount('a')).toBe(0)
  })

  it('replays events after Last-Event-ID, in order, once', async () => {
    let t = 1000
    const hub = new EventHub(undefined, 100, () => t++)
    await hub.publish('a', { type: 'one', data: {} })
    await hub.publish('a', { type: 'two', data: {} })
    await hub.publish('a', { type: 'three', data: {} })
    const first: StoredEvent[] = []
    hub.subscribe('a', (e) => first.push(e), 0)
    expect(first.map((e) => e.type)).toEqual(['one', 'two', 'three'])
    const resumed: string[] = []
    hub.subscribe('a', (e) => resumed.push(e.type), first[0]!.id)
    expect(resumed).toEqual(['two', 'three'])
  })

  it('the replay buffer is bounded', async () => {
    let t = 0
    const hub = new EventHub(undefined, 3, () => t++)
    for (let i = 0; i < 10; i++) await hub.publish('a', { type: `e${i}`, data: {} })
    const got: string[] = []
    hub.subscribe('a', (e) => got.push(e.type), 0)
    expect(got).toEqual(['e7', 'e8', 'e9'])
  })

  it('fans out across instances without duplicates', async () => {
    const bus = memoryBus()
    const h1 = new EventHub(bus.bridge())
    const h2 = new EventHub(bus.bridge())
    const seen1: string[] = []
    const seen2: string[] = []
    h1.subscribe('u', (e) => seen1.push(e.type))
    h2.subscribe('u', (e) => seen2.push(e.type))
    await h1.publish('u', { type: 'sync', data: { count: 3 } })
    expect(seen1).toEqual(['sync'])
    expect(seen2).toEqual(['sync'])
  })

  it('rejects oversized events (NOTIFY limit)', async () => {
    const hub = new EventHub()
    await expect(
      hub.publish('a', { type: 'big', data: { x: 'y'.repeat(MAX_PAYLOAD_BYTES) } }),
    ).rejects.toThrow('too large')
  })
})
