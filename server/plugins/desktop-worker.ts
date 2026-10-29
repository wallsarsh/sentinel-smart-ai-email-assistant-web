import { useConfig } from '../config'
import { useDb } from '../container'
import { jobQueue } from '../jobs/queue'
import { startRunner } from '../jobs/runner'
import { enqueueUserSyncs } from '../jobs/sync'
import { buildHandlers } from '../../worker/handlers'
import { enqueueRetention } from '../../worker/jobs/retention'
import { logger } from '../utils/logger'

/**
 * Standalone desktop: mail checking, triage, briefs and retention run in the
 * same Node process as Nitro, sharing one persisted PGlite connection.
 * No second PostgreSQL server or second PGlite writer is ever started.
 * The worker still has no send capability; the web-only send gate is unchanged.
 */
export default defineNitroPlugin((nitro) => {
  if (useConfig().databaseUrl !== 'pglite:local') return
  // A background-task failure must never take the whole local service down with it.
  process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', {}, reason))
  const db = useDb()
  const queue = jobQueue(db)
  const runner = startRunner({ queue, handlers: buildHandlers(db, { hubBridge: false }), logger })
  let pending = false
  const schedule = async () => {
    if (pending) return
    pending = true
    try {
      const now = new Date()
      await enqueueUserSyncs(db, queue, now)
      await enqueueRetention(db, queue, now)
    } catch (error) {
      logger.error('desktop scheduler failure', {}, error)
    } finally {
      pending = false
    }
  }
  void schedule()
  const interval = setInterval(() => void schedule(), 60_000)
  nitro.hooks.hook('close', async () => {
    clearInterval(interval)
    await runner.stop()
  })
})
