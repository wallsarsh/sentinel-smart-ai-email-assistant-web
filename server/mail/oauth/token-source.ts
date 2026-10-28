import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { secretStoreFor, type KekRing } from '../../security/secret-store'
import { oauthSecretName, type OAuthTokens } from './google'

export type Refresher = (
  t: OAuthTokens,
) => Promise<{ ok: true; tokens: OAuthTokens } | { ok: false; reason: 'revoked' | 'transient' }>

export type TokenSource = { accessToken(): Promise<Result<string, AppFailure>> }

const SKEW_MS = 60_000
const inflight = new Map<string, Promise<Result<string, AppFailure>>>()

/**
 * Hands out a valid access token for one account. Refreshes shortly before
 * expiry, shares one refresh among concurrent callers, stores rotated tokens
 * in the secret store, and marks the account `needs_reauth` when the grant was
 * revoked (a transient failure leaves the account active and is retried).
 */
export function tokenSource(o: {
  db: Db
  ring: KekRing
  userId: string
  accountId: string
  refresher: Refresher
  now?: () => number
}): TokenSource {
  const now = o.now ?? Date.now
  const store = secretStoreFor(o.db, o.userId, o.ring)
  const name = oauthSecretName(o.accountId)
  const key = `${o.userId}:${o.accountId}`

  async function load(): Promise<Result<string, AppFailure>> {
    const raw = await store.get(name)
    if (!raw) return err({ kind: 'auth', problem: 'needs_reauth' })
    const t = JSON.parse(raw) as OAuthTokens
    if (t.expiresAt - SKEW_MS > now()) return ok(t.accessToken)
    let r
    try {
      r = await o.refresher(t)
    } catch {
      return err({ kind: 'network' })
    }
    if (r.ok) {
      await store.put(name, JSON.stringify(r.tokens))
      return ok(r.tokens.accessToken)
    }
    if (r.reason === 'revoked') {
      await forUser(o.db, o.userId).accounts.update(o.accountId, { status: 'needs_reauth' })
      return err({ kind: 'auth', problem: 'needs_reauth' })
    }
    return err({ kind: 'network', code: 'token_refresh' })
  }

  return {
    accessToken() {
      let p = inflight.get(key)
      if (!p) {
        p = load().finally(() => inflight.delete(key))
        inflight.set(key, p)
      }
      return p
    },
  }
}
