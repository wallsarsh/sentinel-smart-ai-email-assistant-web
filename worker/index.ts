// Worker entrypoint: `npm run worker`. Shares server/ code, runs without the HTTP server.
import { useConfig } from '../server/config'
import { createDb } from '../server/db/client'
import { jobQueue } from '../server/jobs/queue'
import { startRunner } from '../server/jobs/runner'
import { logger } from '../server/utils/logger'
import { handlers } from './handlers'

const { db, close } = createDb(useConfig().databaseUrl)
const runner = startRunner({ queue: jobQueue(db), handlers, logger })
logger.info('worker started')

const shutdown = async () => {
  await runner.stop()
  await close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
