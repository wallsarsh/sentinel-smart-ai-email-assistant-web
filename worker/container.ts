import { aiGateway } from '../server/ai/gateway'
import { aiProviderService } from '../server/ai/providers'
import { aiRouter } from '../server/ai/router'
import { useConfig } from '../server/config'
import type { Db } from '../server/db/client'
import { googleOAuth } from '../server/mail/oauth/google'
import { microsoftOAuth } from '../server/mail/oauth/microsoft'
import { providerFactory } from '../server/mail/provider-factory'
import { EventHub } from '../server/sse/hub'
import { createPgBridge } from '../server/sse/pg-bridge'
import { triageService } from '../server/triage/service'

/** Things the worker must never be able to obtain: anything that sends mail, issues a send authorization, or writes drafts. */
export const FORBIDDEN_CAPABILITIES = [
  'mailSender',
  'senders',
  'sendGate',
  'sendConfirmation',
  'sendScheduler',
  'draftSaver',
  'smtp',
] as const

export class CapabilityError extends Error {
  constructor(readonly capability: string) {
    super(`the worker has no "${capability}" capability`)
  }
}

/**
 * The worker's dependency container. It builds read-only mail providers, the
 * AI stack and triage, and nothing that can send. Asking for a send-related
 * service by name throws, so a mistaken wiring fails loudly instead of
 * quietly gaining the ability to send. (The architecture checks also ensure
 * no worker file imports server/mail/send, server/drafts/save or the web
 * container.)
 */
export function workerContainer(db: Db, o: { hubBridge?: boolean } = {}) {
  const c = useConfig()
  const ring = { current: { version: 1, key: c.kek } }
  const redirect = (p: string) => `${c.baseUrl}/api/accounts/${p}/callback`
  const providerFor = providerFactory({
    db,
    ring,
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

  // Events reach browsers through Postgres NOTIFY (the web instances listen).
  const hub = new EventHub()
  if (o.hubBridge !== false)
    void createPgBridge(c.databaseUrl).then(
      (b) => hub.attach(b),
      () => undefined,
    )
  const publish = (userId: string, type: string, data: Record<string, unknown>) =>
    void hub.publish(userId, { type, data }).catch(() => undefined)

  const providers = aiProviderService({ db, ring })
  const router = aiRouter({ db, gateway: aiGateway({ db, providers }) })
  const triage = triageService({
    db,
    router,
    onDone: (userId, count) => publish(userId, 'triage.done', { count }),
  })

  const services = { db, providerFor, hub, publish, ai: { providers, router }, triage }
  type Services = typeof services

  return {
    ...services,
    /** Looks a service up by name. Send-related names and unknown names throw. */
    resolve<K extends keyof Services>(name: K): Services[K] {
      if ((FORBIDDEN_CAPABILITIES as readonly string[]).includes(name as string))
        throw new CapabilityError(name as string)
      if (!(name in services)) throw new CapabilityError(String(name))
      return services[name]
    },
  }
}
export type WorkerContainer = ReturnType<typeof workerContainer>
