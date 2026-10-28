import type { JobQueue } from './queue'

export type Schedule = {
  name: string
  /** Period in ms; runs are keyed by period start so enqueueing twice is harmless. */
  everyMs: number
  /** Users to run for; omit for a global job. */
  users?: () => Promise<string[]>
}

/** Enqueues the current period's job for each schedule. Safe to call from every worker instance. */
export async function enqueueDue(
  queue: JobQueue,
  schedules: Schedule[],
  now: Date,
): Promise<number> {
  let n = 0
  for (const s of schedules) {
    const periodStart = Math.floor(now.getTime() / s.everyMs) * s.everyMs
    const ids: (string | null)[] = s.users ? await s.users() : [null]
    for (const userId of ids)
      if (
        await queue.enqueue(s.name, {
          userId,
          key: `${s.name}:${userId ?? 'all'}:${periodStart}`,
          runAt: new Date(periodStart),
        })
      )
        n++
  }
  return n
}
