// What only a real Postgres can show: migrations apply, the job queue hands each job to one
// worker under concurrency, and LISTEN/NOTIFY carries events between connections.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { jobQueue } from '../../server/jobs/queue'
import { createPgBridge } from '../../server/sse/pg-bridge'
import { DATABASE_URL, resetDatabase } from './harness'

let handle: ReturnType<typeof createDb>
beforeAll(async () => {
  await resetDatabase()
  handle = createDb(DATABASE_URL)
})
afterAll(async () => handle?.close())

describe('on real Postgres', () => {
  it('migrations create the schema (and can be re-run)', async () => {
    const r = await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    )
    expect((r.rows[0] as { n: number }).n).toBeGreaterThan(20)
    await resetDatabase()
  })

  it('concurrent workers never claim the same job (FOR UPDATE SKIP LOCKED)', async () => {
    const q = jobQueue(handle.db)
    for (let i = 0; i < 40; i++) await q.enqueue('t', { key: `k${i}` })
    const claims = await Promise.all(Array.from({ length: 8 }, () => q.claim(10, 60_000)))
    const ids = claims.flat().map((j) => j.id)
    expect(ids).toHaveLength(40)
    expect(new Set(ids).size).toBe(40)
  })

  it('an enqueue with an existing key is a no-op, also under a race', async () => {
    const q = jobQueue(handle.db)
    const r = await Promise.all(Array.from({ length: 6 }, () => q.enqueue('t', { key: 'same' })))
    expect(r.filter(Boolean)).toHaveLength(1)
  })

  it('events published on one connection reach a listener on another', async () => {
    const a = await createPgBridge(DATABASE_URL)
    const b = await createPgBridge(DATABASE_URL)
    const got: { userId: string; type: string }[] = []
    b.onMessage((userId, ev) => got.push({ userId, type: ev.type }))
    await a.publish('u1', { id: 1, type: 'inbox.changed', data: {} })
    for (let i = 0; i < 50 && !got.length; i++) await new Promise((r) => setTimeout(r, 50))
    expect(got).toEqual([{ userId: 'u1', type: 'inbox.changed' }])
    await Promise.all([a.close(), b.close()])
  })
})
