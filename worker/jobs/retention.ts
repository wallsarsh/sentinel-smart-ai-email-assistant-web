import type { Db } from '../../server/db/client'
import type { JobHandler } from '../../server/jobs/runner'
import { jobQueue, type JobQueue } from '../../server/jobs/queue'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'

export const RETENTION_JOB = 'retention.run'

/** Days each kind of record is kept (messages follow the user's setting). */
export const KEEP_DAYS = { briefs: 30, usage: 90, runs: 14, notified: 30, jobs: 7 } as const

export type RetentionResult = {
  messages: number
  briefs: number
  usage: number
  runs: number
  notified: number
}

const ago = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000)

/**
 * Deletes one user's old local data (FR-SET-04). Messages follow the user's
 * retention setting and keep mail that still has an open task; only local
 * copies are removed, never anything in the mailbox. [stop] is checked between
 * parts so a deadline ends the run early without leaving anything half-done.
 */
export async function purgeUser(
  db: Db,
  userId: string,
  now: Date,
  stop: () => boolean = () => false,
): Promise<RetentionResult> {
  const r = forUser(db, userId)
  const out: RetentionResult = { messages: 0, briefs: 0, usage: 0, runs: 0, notified: 0 }
  const days = (await r.settings.get('retention.days')) as number
  out.messages = await r.mail.deleteReceivedBeforeKeepingOpenTasks(ago(now, days))
  if (stop()) return out
  out.briefs = await r.briefs.deleteBefore(ago(now, KEEP_DAYS.briefs))
  out.usage = await r.ai.deleteUsageBefore(ago(now, KEEP_DAYS.usage))
  out.runs = await r.background.deleteRunsBefore(ago(now, KEEP_DAYS.runs))
  out.notified = await r.background.deleteNotifiedBefore(ago(now, KEEP_DAYS.notified))
  return out
}

/** Deletes data that belongs to no one user: expired sessions and reset tokens, finished jobs. */
export async function purgeSystem(db: Db, queue: JobQueue, now: Date) {
  const auth = await authRepo(db).purgeExpired(now)
  const jobs = await queue.purge(ago(now, KEEP_DAYS.jobs))
  return { ...auth, jobs }
}

/** Handler: a job with a user cleans that user's data; one without cleans the shared tables. */
export function retentionHandler(d: { db: Db; now?: () => Date }): JobHandler {
  return async (ctx) => {
    const now = (d.now ?? (() => new Date()))()
    if (ctx.userId) await purgeUser(d.db, ctx.userId, now, () => !ctx.deadline.canStart(1000))
    else await purgeSystem(d.db, jobQueue(d.db), now)
  }
}

/** Queues today's cleanup for every user and the shared tables; the date in the key makes repeat calls no-ops. */
export async function enqueueRetention(db: Db, queue: JobQueue, now: Date): Promise<number> {
  const day = now.toISOString().slice(0, 10)
  // Only the first call of the day fans out; later calls stop at the system key.
  if (!(await queue.enqueue(RETENTION_JOB, { key: `${RETENTION_JOB}:system:${day}` }))) return 0
  let n = 1
  for (const userId of await authRepo(db).allUserIds())
    if (await queue.enqueue(RETENTION_JOB, { userId, key: `${RETENTION_JOB}:${userId}:${day}` }))
      n++
  return n
}
