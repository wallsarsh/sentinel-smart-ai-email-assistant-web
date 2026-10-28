import type { Db } from '../db/client'
import { forUser } from '../repos'
import { authRepo } from '../repos/auth'
import { RateLimiter } from '../security/rate-limit'
import { syncUser } from '../sync/sync-account'
import type { MailProvider } from '../mail/provider'
import type { JobHandler } from './runner'
import type { JobQueue } from './queue'

export const SYNC_JOB = 'mail.sync'
export const INTERVALS = [5, 15, 30, 60] as const

/** Snaps any value to the nearest allowed interval (5/15/30/60 minutes). */
export function clampInterval(n: unknown): (typeof INTERVALS)[number] {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 15
  return INTERVALS.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best))
}

/**
 * Queues the current period's sync for every user that has an active account.
 * Each user's own interval sets the period, and the period start is in the job
 * key, so calling this from every worker every minute queues each sync once.
 */
export async function enqueueUserSyncs(db: Db, queue: JobQueue, now: Date): Promise<number> {
  let n = 0
  for (const userId of await authRepo(db).allUserIds()) {
    const repos = forUser(db, userId)
    if (!(await repos.accounts.list()).some((a) => a.status === 'active')) continue
    const every = clampInterval(await repos.settings.get('bg.intervalMinutes')) * 60_000
    const period = Math.floor(now.getTime() / every) * every
    if (await queue.enqueue(SYNC_JOB, { userId, key: `${SYNC_JOB}:${userId}:${period}` })) n++
  }
  return n
}

const refreshLimiter = new RateLimiter()
export const REFRESH_LIMIT = { max: 3, windowMs: 60_000 }

/** "Refresh now". Returns seconds to wait when called too often, else 0. */
export async function requestRefresh(
  queue: JobQueue,
  userId: string,
  now = new Date(),
): Promise<number> {
  const wait = refreshLimiter.hit(`refresh:${userId}`, REFRESH_LIMIT)
  if (wait) return wait
  // Unique per call within a second so a manual refresh is not swallowed by the scheduled key.
  await queue.enqueue(SYNC_JOB, {
    userId,
    key: `${SYNC_JOB}:now:${userId}:${now.getTime()}`,
    maxAttempts: 2,
  })
  return 0
}

/** Job handler. Throws when every account failed with a retryable error, so the queue backs off. */
export function syncHandler(d: {
  db: Db
  providerFor(userId: string, accountId: string): Promise<MailProvider>
  onPage?: (userId: string, p: { added: string[]; removed: number }) => void
}): JobHandler {
  return async (ctx) => {
    if (!ctx.userId) return
    const userId = ctx.userId
    const results = await syncUser({
      db: d.db,
      userId,
      providerFor: (id) => d.providerFor(userId, id),
      onPage: (p) => d.onPage?.(userId, p),
    })
    const all = Object.values(results)
    const retryable = (r: (typeof all)[number]) =>
      !r.ok && ['network', 'provider', 'rate_limited', 'unknown'].includes(r.error.kind)
    if (all.length > 0 && all.every(retryable)) throw new Error('sync_failed_retryable')
  }
}
