import { logger as defaultLogger, type Logger } from '../utils/logger'
import { Deadline, DeadlineExceeded } from './deadline'
import type { JobQueue, JobRow } from './queue'

export type JobContext = {
  job: JobRow
  userId: string | null
  deadline: Deadline
  payload: Record<string, unknown>
}
export type JobHandler = (ctx: JobContext) => Promise<void>

export type RunnerOptions = {
  queue: JobQueue
  handlers: Record<string, JobHandler>
  concurrency?: number
  budgetMs?: number
  logger?: Logger
}

/** Runs one claimed job: success completes it; a crash or overrun is retried with backoff. */
export async function runJob(o: RunnerOptions, job: JobRow): Promise<'done' | 'retry' | 'failed'> {
  const log = (o.logger ?? defaultLogger).child({
    jobId: job.id,
    jobName: job.name,
    ...(job.user_id ? { userId: job.user_id } : {}),
  })
  const handler = o.handlers[job.name]
  if (!handler) {
    log.warn('no handler registered')
    await o.queue.complete(job.id) // a stale schedule must not loop forever
    return 'done'
  }
  const deadline = new Deadline(o.budgetMs ?? 5 * 60_000)
  try {
    await Promise.race([
      handler({ job, userId: job.user_id, deadline, payload: job.payload }),
      new Promise<never>((_, rej) =>
        setTimeout(() => {
          deadline.cancel()
          rej(new DeadlineExceeded())
        }, deadline.remainingMs + 5000).unref(),
      ),
    ])
    await o.queue.complete(job.id)
    log.info('job done', { attempt: job.attempts })
    return 'done'
  } catch (e) {
    const code = e instanceof DeadlineExceeded ? 'deadline' : e instanceof Error ? e.name : 'error'
    const status = await o.queue.fail(job, code)
    log.warn('job failed', { attempt: job.attempts, code, outcome: status })
    return status === 'failed' ? 'failed' : 'retry'
  } finally {
    deadline.cancel()
  }
}

/** One polling tick: claim what fits and run it. Returns how many jobs ran. */
export async function tick(o: RunnerOptions): Promise<number> {
  const jobs = await o.queue.claim(
    o.concurrency ?? 4,
    (o.budgetMs ?? 5 * 60_000) + 30_000,
    Object.keys(o.handlers),
  )
  await Promise.all(jobs.map((j) => runJob(o, j)))
  return jobs.length
}

export function startRunner(o: RunnerOptions & { pollMs?: number }) {
  let stopped = false
  const loop = (async () => {
    while (!stopped) {
      let ran = 0
      try {
        ran = await tick(o)
      } catch (e) {
        ;(o.logger ?? defaultLogger).error('runner tick failed', {}, e)
      }
      if (ran === 0) await new Promise((r) => setTimeout(r, o.pollMs ?? 2000))
    }
  })()
  return {
    stop: async () => {
      stopped = true
      await loop
    },
  }
}
