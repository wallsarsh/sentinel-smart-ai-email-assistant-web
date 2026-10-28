import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { JobQueue } from '../jobs/queue'
import {
  jobLabel,
  jobOldestQueuedSeconds,
  jobQueueDepth,
  processMemory,
  processUptime,
} from './metrics'

/** Fills the gauges that are read from the database or the process at scrape time. */
export async function collectGauges(queue: Pick<JobQueue, 'stats'>) {
  processUptime.set({}, Math.round(process.uptime()))
  processMemory.set({}, process.memoryUsage().rss)
  jobQueueDepth.clear()
  jobOldestQueuedSeconds.clear()
  const s = await queue.stats()
  // Several unknown names fold into "other"; sum them so nothing is lost.
  const depth = new Map<string, number>()
  for (const r of s.byStatus) {
    const k = `${jobLabel(r.name)}|${['queued', 'running', 'done', 'failed'].includes(r.status) ? r.status : 'other'}`
    depth.set(k, (depth.get(k) ?? 0) + r.n)
  }
  for (const [k, n] of depth) {
    const [name, status] = k.split('|') as [string, string]
    jobQueueDepth.set({ name, status }, n)
  }
  const oldest = new Map<string, number>()
  for (const r of s.oldestQueued)
    oldest.set(jobLabel(r.name), Math.max(oldest.get(jobLabel(r.name)) ?? 0, Math.round(r.seconds)))
  for (const [name, seconds] of oldest) jobOldestQueuedSeconds.set({ name }, seconds)
}

/** Readiness: the database answers and the schema is migrated. */
export async function readiness(
  db: Db,
): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const checks = { database: false, migrations: false }
  try {
    await db.execute(sql`select 1`)
    checks.database = true
    const r = await db.execute(sql`select to_regclass('public.users') is not null as ok`)
    checks.migrations = (r.rows[0] as { ok?: boolean } | undefined)?.ok === true
  } catch {
    // reported as not ready
  }
  return { ready: checks.database && checks.migrations, checks }
}
