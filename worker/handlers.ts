import type { Db } from '../server/db/client'
import { SYNC_JOB, syncHandler } from '../server/jobs/sync'
import type { JobHandler } from '../server/jobs/runner'
import { workerContainer } from './container'

/** Job handlers by name. Later tasks register theirs here (mail check, brief, retention). */
export function buildHandlers(db: Db): Record<string, JobHandler> {
  const c = workerContainer(db)
  const onPage = (userId: string, p: { added: string[]; removed: number }) =>
    c.publish(userId, 'inbox.changed', { added: p.added.length, removed: p.removed })
  return { [SYNC_JOB]: syncHandler({ db, providerFor: c.providerFor, onPage }) }
}
