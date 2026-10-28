import type { Db } from '../server/db/client'
import { MAIL_CHECK_JOB, SYNC_JOB, syncHandler } from '../server/jobs/sync'
import type { JobHandler } from '../server/jobs/runner'
import { workerContainer } from './container'
import { defaultPorts, mailCheck } from './jobs/mail-check'

/** Job handlers by name. */
export function buildHandlers(db: Db): Record<string, JobHandler> {
  const c = workerContainer(db)
  const onPage = (userId: string, p: { added: string[]; removed: number }) =>
    c.publish(userId, 'inbox.changed', { added: p.added.length, removed: p.removed })
  return {
    [MAIL_CHECK_JOB]: mailCheck(
      defaultPorts({ db, providerFor: c.providerFor, triage: c.triage, onPage }),
    ),
    // Jobs queued by earlier versions finish through the plain sync path.
    [SYNC_JOB]: syncHandler({ db, providerFor: c.providerFor, onPage }),
  }
}
