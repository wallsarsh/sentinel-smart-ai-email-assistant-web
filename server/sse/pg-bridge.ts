import { Client } from 'pg'
import type { Bridge, StoredEvent } from './hub'

const CHANNEL = 'sentinel_events'

/** Postgres LISTEN/NOTIFY bridge so every instance sees every user's events. */
export async function createPgBridge(
  databaseUrl: string,
): Promise<Bridge & { close(): Promise<void> }> {
  const listener = new Client({ connectionString: databaseUrl })
  const sender = new Client({ connectionString: databaseUrl })
  await Promise.all([listener.connect(), sender.connect()])
  let handler: (userId: string, ev: StoredEvent) => void = () => {}
  listener.on('notification', (m) => {
    if (!m.payload) return
    try {
      const { userId, ev } = JSON.parse(m.payload) as { userId: string; ev: StoredEvent }
      handler(userId, ev)
    } catch {
      // ignore malformed payloads
    }
  })
  await listener.query(`LISTEN ${CHANNEL}`)
  return {
    onMessage: (h) => void (handler = h),
    async publish(userId, ev) {
      await sender.query('select pg_notify($1, $2)', [CHANNEL, JSON.stringify({ userId, ev })])
    },
    async close() {
      await Promise.all([listener.end(), sender.end()])
    },
  }
}
