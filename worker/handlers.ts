import type { Db } from '../server/db/client'
import { MAIL_CHECK_JOB, SYNC_JOB, syncHandler } from '../server/jobs/sync'
import type { Deadline } from '../server/jobs/deadline'
import type { JobHandler } from '../server/jobs/runner'
import { pushService } from '../server/push/service'
import { webPushTransport } from '../server/push/web-push-transport'
import { useConfig } from '../server/config'
import { workerContainer } from './container'
import { briefStep, defaultBriefPorts } from './jobs/brief'
import { defaultPorts, mailCheck } from './jobs/mail-check'

const briefStepFor = (ports: ReturnType<typeof defaultBriefPorts>) => {
  const step = briefStep(ports)
  return async (userId: string, deadline: Deadline) => void (await step(userId, deadline))
}

/** Job handlers by name. */
export function buildHandlers(db: Db): Record<string, JobHandler> {
  const c = workerContainer(db)
  const push = pushService({ db, transport: webPushTransport(useConfig().vapid) })
  const onPage = (userId: string, p: { added: string[]; removed: number }) =>
    c.publish(userId, 'inbox.changed', { added: p.added.length, removed: p.removed })
  return {
    [MAIL_CHECK_JOB]: mailCheck({
      ...defaultPorts({ db, providerFor: c.providerFor, triage: c.triage, push, onPage }),
      briefStep: briefStepFor(defaultBriefPorts({ db, brief: c.brief, push })),
    }),
    // Jobs queued by earlier versions finish through the plain sync path.
    [SYNC_JOB]: syncHandler({ db, providerFor: c.providerFor, onPage }),
  }
}
