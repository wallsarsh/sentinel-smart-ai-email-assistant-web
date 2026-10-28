// Worker entrypoint: `npm run worker`. Shares server/ code, runs without the HTTP server.
import { useConfig } from '../server/config'
import { createDb } from '../server/db/client'
import { enqueueUserSyncs } from '../server/jobs/sync'
import { jobQueue } from '../server/jobs/queue'
import { startRunner } from '../server/jobs/runner'
import { logger } from '../server/utils/logger'
import { buildHandlers } from './handlers'

const { db, close } = createDb(useConfig().databaseUrl)
const runner = startRunner({ queue: jobQueue(db), handlers: buildHandlers(db), logger })
const queue = jobQueue(db)
const scheduler = setInterval(() => {
  enqueueUserSyncs(db, queue, new Date()).catch((e) =>
    logger.error({ err: String(e) }, 'schedule failed'),
  )
}, 60_000)
logger.info('worker started')

const shutdown = async () => {
  clearInterval(scheduler)
  await runner.stop()
  await close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
