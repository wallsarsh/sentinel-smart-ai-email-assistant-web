import type { Db } from '../db/client'
import { forUser } from '../repos'
import { secretStoreFor, type KekRing } from '../security/secret-store'
import { GmailMailProvider } from './gmail/provider'
import { googleTransport } from './gmail/http'
import { graphTransport } from './graph/http'
import { GraphMailProvider } from './graph/provider'
import { ImapMailProvider } from './imap/provider'
import { connectImap, type ImapSession } from './imap/session'
import type { googleOAuth } from './oauth/google'
import type { microsoftOAuth } from './oauth/microsoft'
import { tokenSource } from './oauth/token-source'
import type { MailProvider } from './provider'

export type FactoryDeps = {
  db: Db
  ring: KekRing
  google: ReturnType<typeof googleOAuth>
  microsoft: ReturnType<typeof microsoftOAuth>
  /** Replaceable in tests. */
  connectImap?: typeof connectImap
}

/**
 * Builds the right MailProvider for an account, wired to its stored
 * credentials. Providers have no send method; sending uses server/mail/send.
 */
export function providerFactory(d: FactoryDeps) {
  return async function providerFor(userId: string, accountId: string): Promise<MailProvider> {
    const repos = forUser(d.db, userId)
    const a = await repos.accounts.get(accountId)
    if (!a) throw new Error('account_not_found')
    if (a.type === 'gmail') {
      const tokens = tokenSource({
        db: d.db,
        ring: d.ring,
        userId,
        accountId,
        refresher: (t) => d.google.refresh(t),
      })
      return new GmailMailProvider(googleTransport(tokens), { accountEmail: a.email, accountId })
    }
    if (a.type === 'microsoft_graph') {
      const tokens = tokenSource({
        db: d.db,
        ring: d.ring,
        userId,
        accountId,
        refresher: (t) => d.microsoft.refresh(t),
      })
      return new GraphMailProvider(graphTransport(tokens), { accountId })
    }
    const s = await repos.accounts.getImap(accountId)
    const password = await secretStoreFor(d.db, userId, d.ring).get(`imap:${accountId}`)
    if (!s || !password) throw new Error('imap_credentials_missing')
    const session: ImapSession = await (d.connectImap ?? connectImap)(s, {
      username: s.username,
      password,
    })
    return new ImapMailProvider(session, {
      accountEmail: a.email,
      accountId,
      draftsFolder: s.draftsFolder ?? undefined,
    })
  }
}
