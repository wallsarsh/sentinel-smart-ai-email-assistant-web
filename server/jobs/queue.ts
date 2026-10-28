import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'

export type JobRow = {
  id: string
  name: string
  user_id: string | null
  key: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

export type EnqueueOptions = {
  userId?: string | null
  /** Same key = same job; a second enqueue is a no-op. */
  key: string
  payload?: Record<string, unknown>
  runAt?: Date
  maxAttempts?: number
}

export const MAX_RUNNING_PER_USER = 2

/** Retry delay: 30 s doubling, capped at 30 minutes. */
export const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 30 * 60_000)

export function jobQueue(db: Db, now: () => Date = () => new Date()) {
  return {
    /** Returns true when a new job was queued, false when the key already existed. */
    async enqueue(name: string, o: EnqueueOptions): Promise<boolean> {
      const r = await db.execute(sql`
        insert into jobs (name, user_id, key, payload, run_at, max_attempts)
        values (${name}, ${o.userId ?? null}, ${o.key}, ${JSON.stringify(o.payload ?? {})}::jsonb,
                ${(o.runAt ?? now()).toISOString()}, ${o.maxAttempts ?? 5})
        on conflict (key) do nothing returning id`)
      return r.rows.length > 0
    },

    /**
     * Claims up to [limit] due jobs for [leaseMs]. A user never has more than
     * MAX_RUNNING_PER_USER jobs running at once, so one account cannot starve the rest.
     */
    async claim(limit: number, leaseMs: number, names?: string[]): Promise<JobRow[]> {
      const t = now().toISOString()
      const until = new Date(now().getTime() + leaseMs).toISOString()
      const nameFilter = names?.length
        ? sql`and name = any(${sql.raw(`array[${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')}]`)})`
        : sql``
      const r = await db.execute(sql`
        with running as (
          select user_id, count(*) c from jobs
          where status = 'running' and locked_until > ${t} and user_id is not null group by user_id
        ), due as (
          select j.id from jobs j
          left join running r on r.user_id = j.user_id
          where (j.status = 'queued' and j.run_at <= ${t}
                 or j.status = 'running' and j.locked_until <= ${t})
            and (j.user_id is null or coalesce(r.c, 0) < ${MAX_RUNNING_PER_USER})
            ${nameFilter}
          order by j.run_at
          limit ${limit}
          for update of j skip locked
        )
        update jobs set status = 'running', attempts = attempts + 1, locked_until = ${until}
        where id in (select id from due)
        returning id, name, user_id, key, payload, attempts, max_attempts`)
      return r.rows as unknown as JobRow[]
    },

    async complete(id: string) {
      await db.execute(
        sql`update jobs set status = 'done', locked_until = null, finished_at = ${now().toISOString()} where id = ${id}`,
      )
    },

    /** Failure: retry with backoff until attempts are used up, then mark failed. Returns the final status. */
    async fail(
      job: Pick<JobRow, 'id' | 'attempts' | 'max_attempts'>,
      code: string,
    ): Promise<'queued' | 'failed'> {
      const t = now()
      if (job.attempts >= job.max_attempts) {
        await db.execute(
          sql`update jobs set status = 'failed', locked_until = null, last_error = ${code.slice(0, 80)}, finished_at = ${t.toISOString()} where id = ${job.id}`,
        )
        return 'failed'
      }
      const next = new Date(t.getTime() + backoffMs(job.attempts)).toISOString()
      await db.execute(
        sql`update jobs set status = 'queued', locked_until = null, last_error = ${code.slice(0, 80)}, run_at = ${next} where id = ${job.id}`,
      )
      return 'queued'
    },

    /** Deletes finished jobs older than [before]. */
    async purge(before: Date): Promise<number> {
      const r = await db.execute(
        sql`delete from jobs where status in ('done','failed') and finished_at < ${before.toISOString()} returning id`,
      )
      return r.rows.length
    },
  }
}

export type JobQueue = ReturnType<typeof jobQueue>
