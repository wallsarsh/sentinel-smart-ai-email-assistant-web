/** An event for one user. Data is small and carries ids, never mail content. */
export type LiveEvent = { type: string; data: Record<string, unknown> }
export type StoredEvent = LiveEvent & { id: number }

/** Moves events between server instances (Postgres LISTEN/NOTIFY in production). */
export type Bridge = {
  publish(userId: string, ev: StoredEvent): Promise<void>
  onMessage(handler: (userId: string, ev: StoredEvent) => void): void
}

type Subscriber = (ev: StoredEvent) => void

export const MAX_PAYLOAD_BYTES = 6000 // NOTIFY limit is 8000

/**
 * Per-user fan-out with a short replay buffer so a reconnecting browser (via
 * Last-Event-ID) catches up. Ids are per hub and increase; with several
 * instances a client may see ids from different hubs, so ids are time-based
 * (ms since epoch * 1000 + counter) to stay roughly ordered.
 */
export class EventHub {
  private subs = new Map<string, Set<Subscriber>>()
  private buffers = new Map<string, StoredEvent[]>()
  private counter = 0

  private bridge?: Bridge

  constructor(
    bridge?: Bridge,
    private bufferSize = 100,
    private now: () => number = Date.now,
  ) {
    if (bridge) this.attach(bridge)
  }

  /** Connects the cross-instance bridge to a hub that already has subscribers. */
  attach(bridge: Bridge) {
    this.bridge = bridge
    bridge.onMessage((userId, ev) => this.deliver(userId, ev))
  }

  private nextId() {
    this.counter = (this.counter + 1) % 1000
    return this.now() * 1000 + this.counter
  }

  /** Publishes locally and to other instances. */
  async publish(userId: string, ev: LiveEvent): Promise<void> {
    if (JSON.stringify(ev).length > MAX_PAYLOAD_BYTES) throw new Error('event too large')
    const stored: StoredEvent = { ...ev, id: this.nextId() }
    this.deliver(userId, stored)
    await this.bridge?.publish(userId, stored)
  }

  /** Called for events from this instance and from the bridge. Duplicates are dropped. */
  private deliver(userId: string, ev: StoredEvent) {
    const buf = this.buffers.get(userId) ?? []
    if (buf.some((b) => b.id === ev.id)) return
    buf.push(ev)
    if (buf.length > this.bufferSize) buf.shift()
    this.buffers.set(userId, buf)
    for (const s of this.subs.get(userId) ?? []) s(ev)
  }

  /** Subscribes; events after [lastEventId] are replayed first. Returns the unsubscribe function. */
  subscribe(userId: string, send: Subscriber, lastEventId?: number): () => void {
    const set = this.subs.get(userId) ?? new Set()
    this.subs.set(userId, set)
    set.add(send)
    if (lastEventId !== undefined)
      for (const ev of this.buffers.get(userId) ?? []) if (ev.id > lastEventId) send(ev)
    return () => {
      set.delete(send)
      if (set.size === 0) this.subs.delete(userId)
    }
  }

  subscriberCount(userId: string) {
    return this.subs.get(userId)?.size ?? 0
  }
}
