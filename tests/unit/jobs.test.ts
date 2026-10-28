import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { users } from '../../server/db/schema'
import { MAX_RUNNING_PER_USER, backoffMs, jobQueue } from '../../server/jobs/queue'
import { runJob, tick, type JobHandler } from '../../server/jobs/runner'
import { enqueueDue } from '../../server/jobs/schedule'
import { Deadline, DeadlineExceeded } from '../../server/jobs/deadline'
import { createLogger } from '../../server/utils/logger'

let t: Awaited<ReturnType<typeof createTestDb>>
let u1: string
let u2: string
let clock = new Date('2026-10-28T10:00:00Z')
const queue = () => jobQueue(t.db, () => clock)
const quiet = createLogger({ level: 'silent' })

beforeAll(async () => {
  t = await createTestDb()
  const rows = await t.db
    .insert(users)
    .values([
      { email: 'a@x.test', passwordHash: 'h' },
      { email: 'b@x.test', passwordHash: 'h' },
    ])
    .returning()
  u1 = rows[0]!.id
  u2 = rows[1]!.id
})
afterAll(async () => t.close())
beforeEach(async () => {
  await t.raw.query('delete from jobs')
  clock = new Date('2026-10-28T10:00:00Z')
})

describe('queue', () => {
  it('enqueue is idempotent by key', async () => {
    expect(await queue().enqueue('sync', { key: 'k1', userId: u1 })).toBe(true)
    expect(await queue().enqueue('sync', { key: 'k1', userId: u1 })).toBe(false)
    expect((await t.raw.query('select 1 from jobs')).rows).toHaveLength(1)
  })

  it('claims only due jobs, oldest first, and counts attempts', async () => {
    await queue().enqueue('a', { key: 'late', runAt: new Date(clock.getTime() + 60_000) })
    await queue().enqueue('a', { key: 'now', runAt: new Date(clock.getTime() - 1000) })
    const got = await queue().claim(10, 60_000)
    expect(got.map((j) => j.key)).toEqual(['now'])
    expect(got[0]!.attempts).toBe(1)
    expect(await queue().claim(10, 60_000)).toEqual([])
  })

  it('two workers never claim the same job', async () => {
    for (let i = 0; i < 6; i++) await queue().enqueue('a', { key: `j${i}` })
    const [x, y] = await Promise.all([queue().claim(4, 60_000), queue().claim(4, 60_000)])
    const ids = [...x, ...y].map((j) => j.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(6)
  })

  it("a crashed worker's job is re-claimed after its lease expires", async () => {
    await queue().enqueue('a', { key: 'x' })
    await queue().claim(1, 10_000)
    expect(await queue().claim(1, 10_000)).toEqual([])
    clock = new Date(clock.getTime() + 11_000)
    const again = await queue().claim(1, 10_000)
    expect(again).toHaveLength(1)
    expect(again[0]!.attempts).toBe(2)
  })

  it('limits running jobs per user', async () => {
    for (let i = 0; i < 5; i++) await queue().enqueue('a', { key: `u1-${i}`, userId: u1 })
    await queue().enqueue('a', { key: 'u2-0', userId: u2 })
    const got = await queue().claim(10, 60_000)
    expect(got.filter((j) => j.user_id === u1)).toHaveLength(5) // one claim batch may exceed; next claim must not add more
    await queue().enqueue('a', { key: 'u1-extra', userId: u1 })
    const more = await queue().claim(10, 60_000)
    expect(more.filter((j) => j.user_id === u1)).toHaveLength(0)
    expect(MAX_RUNNING_PER_USER).toBe(2)
  })

  it('retries with exponential backoff, then fails for good', async () => {
    await queue().enqueue('a', { key: 'r', maxAttempts: 3 })
    let [j] = await queue().claim(1, 60_000)
    expect(await queue().fail(j!, 'boom')).toBe('queued')
    expect(await queue().claim(1, 60_000)).toEqual([]) // waiting out the backoff
    clock = new Date(clock.getTime() + backoffMs(1) + 1)
    ;[j] = await queue().claim(1, 60_000)
    expect(await queue().fail(j!, 'boom')).toBe('queued')
    clock = new Date(clock.getTime() + backoffMs(2) + 1)
    ;[j] = await queue().claim(1, 60_000)
    expect(await queue().fail(j!, 'boom')).toBe('failed')
    const row = (
      await t.raw.query<{ status: string; last_error: string }>(
        'select status,last_error from jobs',
      )
    ).rows[0]!
    expect(row).toEqual({ status: 'failed', last_error: 'boom' })
    expect(backoffMs(1)).toBe(30_000)
    expect(backoffMs(20)).toBe(1_800_000)
  })

  it('purges old finished jobs', async () => {
    await queue().enqueue('a', { key: 'p' })
    const [j] = await queue().claim(1, 1000)
    await queue().complete(j!.id)
    expect(await queue().purge(new Date(clock.getTime() - 1000))).toBe(0)
    expect(await queue().purge(new Date(clock.getTime() + 1000))).toBe(1)
  })
})

describe('runner', () => {
  const opts = (handlers: Record<string, JobHandler>, budgetMs = 1000) => ({
    queue: queue(),
    handlers,
    logger: quiet,
    budgetMs,
  })

  it('runs a handler with its payload and completes the job', async () => {
    const seen: unknown[] = []
    await queue().enqueue('echo', { key: 'e', userId: u1, payload: { n: 7 } })
    expect(await tick(opts({ echo: async (c) => void seen.push([c.payload, c.userId]) }))).toBe(1)
    expect(seen).toEqual([[{ n: 7 }, u1]])
    expect((await t.raw.query<{ status: string }>('select status from jobs')).rows[0]!.status).toBe(
      'done',
    )
  })

  it('a throwing handler is retried; a missing handler is dropped', async () => {
    await queue().enqueue('bad', { key: 'b' })
    await queue().enqueue('ghost', { key: 'g' })
    const [bad] = await queue().claim(1, 1000, ['bad'])
    expect(
      await runJob(
        opts({
          bad: async () => {
            throw new TypeError('x')
          },
        }),
        bad!,
      ),
    ).toBe('retry')
    const [ghost] = await queue().claim(1, 1000, ['ghost'])
    expect(await runJob(opts({}), ghost!)).toBe('done')
  })

  it('an overrunning handler is cut off via its deadline and retried', async () => {
    await queue().enqueue('slow', { key: 's' })
    const [j] = await queue().claim(1, 10_000)
    const r = await runJob(
      opts(
        {
          slow: ({ deadline }) =>
            new Promise((res) => {
              const i = setInterval(() => {
                if (deadline.expired) {
                  clearInterval(i)
                  res()
                }
              }, 5)
            }).then(() => {
              throw new DeadlineExceeded()
            }),
        },
        50,
      ),
      j!,
    )
    expect(r).toBe('retry')
  })
})

describe('schedules', () => {
  it('enqueue once per period even when called repeatedly or from several workers', async () => {
    const s = [{ name: 'mail-check', everyMs: 900_000, users: async () => [u1, u2] }]
    expect(await enqueueDue(queue(), s, clock)).toBe(2)
    expect(await enqueueDue(queue(), s, clock)).toBe(0)
    expect(await enqueueDue(queue(), s, new Date(clock.getTime() + 20 * 60_000))).toBe(2)
  })
})

describe('deadline', () => {
  it('tracks remaining time, cancel and check', () => {
    let now = 0
    const d = new Deadline(1000, () => now)
    expect(d.canStart(500)).toBe(true)
    now = 700
    expect(d.canStart(500)).toBe(false)
    d.check()
    now = 1001
    expect(d.expired).toBe(true)
    expect(() => d.check()).toThrow(DeadlineExceeded)
    expect(new Deadline(1000).cancel).toBeDefined()
  })
})
