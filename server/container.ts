// DI root: wires services from configuration. One of the two places (with
// server/api/send/) allowed to import the send module.
import { authService } from './auth/service'
import { mfaService } from './auth/mfa'
import { auditorFor } from './audit/audit'
import { accountLifecycle } from './account/lifecycle'
import { EventHub } from './sse/hub'
import { createPgBridge } from './sse/pg-bridge'
import { useConfig } from './config'
import { createDb, type Db } from './db/client'
import { googleOAuth } from './mail/oauth/google'
import { createSystemMailer } from './mail/send/system-mailer'

let db: Db | undefined
let auth: ReturnType<typeof authService> | undefined
let mfa: ReturnType<typeof mfaService> | undefined

export function useDb(): Db {
  return (db ??= createDb(useConfig().databaseUrl).db)
}

export function useAuth() {
  const c = useConfig()
  return (auth ??= authService({
    db: useDb(),
    baseUrl: c.baseUrl,
    auditor: auditorFor(useDb()),
    mailer: createSystemMailer({ smtpUrl: c.systemMail.smtpUrl, from: c.systemMail.from }),
  }))
}

export function useMfa() {
  const c = useConfig()
  return (mfa ??= mfaService({
    db: useDb(),
    ring: { current: { version: 1, key: c.kek } },
    sessionSecret: c.sessionSecret,
  }))
}

export const useAuditor = () => auditorFor(useDb())

/** Provider token revokers register here as accounts connect (T042, T043). */
export const tokenRevokers: { name: string; revoke(userId: string): Promise<void> }[] = []

export const useLifecycle = () =>
  accountLifecycle({ db: useDb(), revokers: tokenRevokers, auditor: auditorFor(useDb()) })

let hub: EventHub | undefined
/** The event hub; cross-instance delivery uses Postgres LISTEN/NOTIFY. */
export function useHub(): EventHub {
  if (hub) return hub
  hub = new EventHub()
  void createPgBridge(useConfig().databaseUrl).then(
    (bridge) => hub?.attach(bridge),
    () => undefined, // single-instance mode until the bridge connects
  )
  return hub
}

/** The key ring for the secret store. */
export const tokenKek = () => ({ current: { version: 1, key: useConfig().kek } })

let google: ReturnType<typeof googleOAuth> | undefined
export function useGoogleOAuth() {
  const c = useConfig()
  return (google ??= googleOAuth({
    clientId: c.google.clientId,
    clientSecret: c.google.clientSecret,
    redirectUri: `${c.baseUrl}/api/accounts/google/callback`,
    secret: c.sessionSecret,
  }))
}
