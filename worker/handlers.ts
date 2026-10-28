import type { Db } from '../server/db/client'
import { useConfig } from '../server/config'
import { SYNC_JOB, syncHandler } from '../server/jobs/sync'
import type { JobHandler } from '../server/jobs/runner'
import { googleOAuth } from '../server/mail/oauth/google'
import { microsoftOAuth } from '../server/mail/oauth/microsoft'
import { providerFactory } from '../server/mail/provider-factory'

/** Job handlers by name. Later tasks register theirs here (mail check, brief, retention). */
export function buildHandlers(db: Db): Record<string, JobHandler> {
  const c = useConfig()
  const redirect = (p: string) => `${c.baseUrl}/api/accounts/${p}/callback`
  const providerFor = providerFactory({
    db,
    ring: { current: { version: 1, key: c.kek } },
    google: googleOAuth({
      clientId: c.google.clientId,
      clientSecret: c.google.clientSecret,
      redirectUri: redirect('google'),
      secret: c.sessionSecret,
    }),
    microsoft: microsoftOAuth({
      clientId: c.microsoft.clientId,
      clientSecret: c.microsoft.clientSecret,
      authority: c.microsoft.authority,
      redirectUri: redirect('microsoft'),
      secret: c.sessionSecret,
    }),
  })
  return { [SYNC_JOB]: syncHandler({ db, providerFor }) }
}
