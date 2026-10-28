import { createHash, randomBytes } from 'node:crypto'
import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import { secretStoreFor, type KekRing } from '../../security/secret-store'
import type { SendRefusal } from '../../../shared/errors/failure'
import { err, ok, type Result } from '../../../shared/errors/result'
import { contentHash, unresolvedPlaceholders, type ApprovedContent } from './approved-content'

/** Evidence that the confirmation control was activated by the user in a live session. */
export type UserConfirmation = {
  confirmedAt: Date
  sessionId: string
  /** The route verified two-factor (or none is required) for this send. */
  stepUpSatisfied: boolean
}

export type Authorization = { nonce: string; releaseAt: Date; expiresAt: Date; contentHash: string }
/** Proof that the gate redeemed an authorization. Only [sendGate.redeem] attaches it. */
export const REDEEMED: unique symbol = Symbol('redeemed')
export type Redeemed = {
  readonly [REDEEMED]: true
  content: ApprovedContent
  userId: string
  accountId: string
  contentHash: string
}

export const VALIDITY_MS = 2 * 60_000
export const MAX_CONFIRMATION_AGE_MS = 30_000

const hashNonce = (nonce: string) => createHash('sha256').update(nonce).digest('hex')
const secretName = (nonceHash: string) => `send:${nonceHash}`
const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export type SendGateDeps = { db: Db; ring: KekRing; now?: () => Date }

/**
 * Issues and redeems send authorizations. An authorization is single-use,
 * short-lived, bound to the user's session and to a hash of the exact
 * content, and lives in the database so it survives restarts and works across
 * instances. Nothing else in the codebase can create one.
 */
export function sendGate(d: SendGateDeps) {
  const now = d.now ?? (() => new Date())
  const secrets = (userId: string) => secretStoreFor(d.db, userId, d.ring)

  return {
    /** Called only from the confirmation endpoint, with the user's explicit action as [confirmation]. */
    async authorize(
      userId: string,
      content: ApprovedContent,
      confirmation: UserConfirmation,
      o: { placeholderOverride?: boolean; undoSeconds?: number } = {},
    ): Promise<Result<Authorization, SendRefusal>> {
      const t = now()
      const repos = forUser(d.db, userId)
      const age = t.getTime() - confirmation.confirmedAt.getTime()
      if (age > MAX_CONFIRMATION_AGE_MS || age < -5_000) return err('not_confirmed')
      if (!content.to.length && !content.cc.length) return err('no_recipients')
      if (!content.bodyText.trim()) return err('empty_body')
      const settings = await repos.settings.all()
      if (settings['send.requireStepUp'] && !confirmation.stepUpSatisfied)
        return err('step_up_required')
      if (
        settings['send.blockOnPlaceholders'] &&
        !o.placeholderOverride &&
        unresolvedPlaceholders(content).length
      )
        return err('placeholders')
      const limit = settings['send.dailyLimit']
      if (limit > 0 && (await repos.send.sentSince(startOfUtcDay(t))) >= limit)
        return err('daily_limit')
      if (!(await repos.accounts.get(content.accountId))) return err('unknown_authorization')

      const undo = Math.min(
        Math.max(Math.round(o.undoSeconds ?? settings['send.undoSeconds']), 0),
        30,
      )
      const nonce = randomBytes(16).toString('hex')
      const nonceHash = hashNonce(nonce)
      const hash = contentHash(content)
      const releaseAt = new Date(t.getTime() + undo * 1000)
      const expiresAt = new Date(releaseAt.getTime() + VALIDITY_MS)
      await secrets(userId).put(secretName(nonceHash), JSON.stringify(content))
      await repos.send.createAuthorization({
        nonceHash,
        sessionId: confirmation.sessionId,
        accountId: content.accountId,
        contentHash: hash,
        issuedAt: t,
        releaseAt,
        expiresAt,
      })
      return ok({ nonce, releaseAt, expiresAt, contentHash: hash })
    },

    /**
     * Uses an authorization exactly once. Verifies it is known, not used or
     * revoked, not expired, that the confirming session is still valid, and
     * that the stored content still hashes to what was confirmed (and, when
     * [expected] is given, to what the caller is about to send).
     */
    async redeem(
      userId: string,
      nonceHash: string,
      expected?: ApprovedContent,
    ): Promise<Result<Redeemed, SendRefusal>> {
      const repos = forUser(d.db, userId)
      const t = now()
      const row = await repos.send.getAuthorization(nonceHash)
      if (!row) return err('unknown_authorization')
      if (row.state === 'used') return err('already_used')
      if (row.state === 'revoked') return err('revoked')
      if (row.expiresAt <= t) {
        await finish(userId, nonceHash)
        return err('expired')
      }
      if (!(await repos.send.sessionAlive(row.sessionId, t))) {
        await repos.send.revokeAuthorization(nonceHash)
        await finish(userId, nonceHash)
        return err('revoked')
      }
      const raw = await secrets(userId).get(secretName(nonceHash))
      if (!raw) return err('unknown_authorization')
      const content = JSON.parse(raw, reviveDates) as ApprovedContent
      if (
        contentHash(content) !== row.contentHash ||
        (expected && contentHash(expected) !== row.contentHash)
      )
        return err('content_changed')

      // Atomic claim: of any number of concurrent redeemers, exactly one wins.
      const claimed = await claim(userId, nonceHash, t)
      if (!claimed) return err('already_used')
      await finish(userId, nonceHash) // the sealed content is no longer needed
      return ok({
        [REDEEMED]: true,
        content,
        userId,
        accountId: row.accountId,
        contentHash: row.contentHash,
      })
    },

    /** Undo. True when the send was stopped; false when it had already been released. */
    async revoke(userId: string, nonce: string): Promise<boolean> {
      const h = hashNonce(nonce)
      const done = await forUser(d.db, userId).send.revokeAuthorization(h)
      if (done) await finish(userId, h)
      return done
    },

    hashNonce,
  }

  async function claim(userId: string, nonceHash: string, t: Date): Promise<boolean> {
    return forUser(d.db, userId).send.claim(nonceHash, t)
  }
  async function finish(userId: string, nonceHash: string) {
    await secrets(userId).delete(secretName(nonceHash))
  }
}

const reviveDates = (_k: string, v: unknown) => v
export type SendGate = ReturnType<typeof sendGate>
