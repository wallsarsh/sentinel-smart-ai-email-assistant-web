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
import { triageCorrections } from './triage/corrections'
import { triageService } from './triage/service'
import { draftGenerator } from './drafts/generator'
import { draftSaver } from './drafts/save'
import { providerFactory } from './mail/provider-factory'
import { sendConfirmation } from './mail/send/confirmation'
import { sendGate } from './mail/send/send-gate'
import { googleTransport } from './mail/gmail/http'
import { graphTransport } from './mail/graph/http'
import { tokenSource } from './mail/oauth/token-source'
import { gmailSender } from './mail/send/gmail'
import { graphSender } from './mail/send/graph'
import { sendScheduler } from './mail/send/scheduler'
import { smtpSender } from './mail/send/smtp'
import type { MailSender } from './mail/send/support'
import { secretStoreFor } from './security/secret-store'
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

export const useCorrections = () => triageCorrections(useDb())
export const useTriage = () =>
  triageService({
    db: useDb(),
    router: useAiRouter(),
    onDone: (userId, count) =>
      void useHub()
        .publish(userId, { type: 'triage.done', data: { count } })
        .catch(() => undefined),
  })

export const useDraftGenerator = () =>
  draftGenerator({ db: useDb(), gateway: useAiGateway(), router: useAiRouter() })

let providerFor: ReturnType<typeof providerFactory> | undefined
/** Builds the mail provider for an account (read and draft access only). */
export function useProviderFor() {
  return (providerFor ??= providerFactory({
    db: useDb(),
    ring: tokenKek(),
    google: useGoogleOAuth(),
    microsoft: useMicrosoftOAuth(),
  }))
}
export const useDraftSaver = () =>
  draftSaver({ db: useDb(), providerFor: (u, a) => useProviderFor()(u, a) })

export const useSendGate = () => sendGate({ db: useDb(), ring: tokenKek() })
export const useSendConfirmation = () =>
  sendConfirmation({ db: useDb(), gate: useSendGate(), saver: useDraftSaver() })

let senders: Record<'gmail' | 'microsoft_graph' | 'imap', MailSender> | undefined
/** The only place that builds mail senders. Everything here talks to providers with the user's own credentials. */
export function useSenders() {
  const db = useDb()
  const ring = tokenKek()
  return (senders ??= {
    gmail: gmailSender({
      db,
      apiFor: (userId, accountId) =>
        googleTransport(
          tokenSource({
            db,
            ring,
            userId,
            accountId,
            refresher: (t) => useGoogleOAuth().refresh(t),
          }),
        ),
    }),
    microsoft_graph: graphSender({
      db,
      apiFor: (userId, accountId) =>
        graphTransport(
          tokenSource({
            db,
            ring,
            userId,
            accountId,
            refresher: (t) => useMicrosoftOAuth().refresh(t),
          }),
        ),
    }),
    imap: smtpSender({
      db,
      async targetFor(userId, accountId) {
        const repos = forUser(db, userId)
        const s = await repos.accounts.getImap(accountId)
        const store = secretStoreFor(db, userId, ring)
        const password =
          (await store.get(`smtp:${accountId}`)) ?? (await store.get(`imap:${accountId}`))
        if (!s || !password) throw new Error('imap_credentials_missing')
        return {
          host: s.smtpHost,
          port: s.smtpPort,
          security: s.smtpSecurity,
          username: s.smtpUsername ?? s.username,
          password,
          serverSavesSent: s.serverSavesSent,
        }
      },
      async imapFor(userId, accountId) {
        const repos = forUser(db, userId)
        const s = await repos.accounts.getImap(accountId)
        const password = await secretStoreFor(db, userId, ring).get(`imap:${accountId}`)
        if (!s || !password) throw new Error('imap_credentials_missing')
        return connectImap(s, { username: s.username, password })
      },
    }),
  })
}

let scheduler: ReturnType<typeof sendScheduler> | undefined
/** Releases confirmed sends after their undo window. Runs in the web process only (the worker has no send capability). */
export function useSendScheduler() {
  return (scheduler ??= sendScheduler({
    db: useDb(),
    gate: useSendGate(),
    senderFor: (type) => useSenders()[type],
    notify: (userId, e) =>
      void useHub()
        .publish(userId, { type: 'send.status', data: { ref: e.ref, state: e.state } })
        .catch(() => undefined),
  }))
}
