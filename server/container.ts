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
import { microsoftOAuth } from './mail/oauth/microsoft'
import { accountService } from './accounts/service'
import { connectImap } from './mail/imap/session'
import { ImapMailProvider } from './mail/imap/provider'
import { testSmtp } from './mail/send/smtp-test'
import { loadTokens } from './mail/oauth/connect'
import { forUser } from './repos'
import { aiProviderService } from './ai/providers'
import { catalog } from './ai/catalog'
import { aiBench } from './ai/bench'
import { aiGateway } from './ai/gateway'
import { aiRouter } from './ai/router'
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

export const useLifecycle = () => {
  registerRevokers()
  return accountLifecycle({ db: useDb(), revokers: tokenRevokers, auditor: auditorFor(useDb()) })
}

/** Revokes Google grants when a whole user account is deleted. */
function registerRevokers() {
  if (tokenRevokers.some((r) => r.name === 'google')) return
  tokenRevokers.push({
    name: 'google',
    async revoke(userId) {
      for (const a of (await forUser(useDb(), userId).accounts.list()).filter(
        (x) => x.type === 'gmail',
      )) {
        const t = await loadTokens(useDb(), tokenKek(), userId, a.id)
        if (t) await useGoogleOAuth().revoke(t)
      }
    },
  })
}

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

let microsoft: ReturnType<typeof microsoftOAuth> | undefined
export function useMicrosoftOAuth() {
  const c = useConfig()
  return (microsoft ??= microsoftOAuth({
    clientId: c.microsoft.clientId,
    clientSecret: c.microsoft.clientSecret,
    authority: c.microsoft.authority,
    redirectUri: `${c.baseUrl}/api/accounts/microsoft/callback`,
    secret: c.sessionSecret,
  }))
}

let accounts: ReturnType<typeof accountService> | undefined
export function useAccounts() {
  return (accounts ??= accountService({
    db: useDb(),
    ring: tokenKek(),
    async imapProvider(s, cred) {
      const session = await connectImap(s, cred)
      return new ImapMailProvider(session, { accountEmail: cred.username, accountId: '' })
    },
    smtpTest: (s, cred) => testSmtp(s, cred),
    async revoke(type, t) {
      if (type === 'gmail') await useGoogleOAuth().revoke(t)
    },
  }))
}

let aiProviders: ReturnType<typeof aiProviderService> | undefined
export function useAiProviders() {
  return (aiProviders ??= aiProviderService({ db: useDb(), ring: tokenKek() }))
}

export const useCatalog = () => catalog(useDb())

export const useAiGateway = () => aiGateway({ db: useDb(), providers: useAiProviders() })
export const useAiRouter = () => aiRouter({ db: useDb(), gateway: useAiGateway() })

export const useAiBench = () => aiBench({ gateway: useAiGateway() })
