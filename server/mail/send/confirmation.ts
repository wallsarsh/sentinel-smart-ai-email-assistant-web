import { z } from 'zod'
import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import { authRepo } from '../../repos/auth'
import { rowToMailMessage } from '../../sync/message-mapper'
import { scanForeignDetails, placeholders, type ForeignDetail } from '../../drafts/clean'
import { withSignature, type draftSaver } from '../../drafts/save'
import { replySubject } from '../mime/reply-builder'
import type { AppFailure } from '../../../shared/errors/failure'
import { err, ok, type Result } from '../../../shared/errors/result'
import { contentHash, type ApprovedContent } from './approved-content'
import type { SendGate } from './send-gate'

const draftInput = z.object({
  body: z.string().max(100_000),
  to: z.array(z.email()).max(50),
  cc: z.array(z.email()).max(50).default([]),
  replyAll: z.boolean().default(false),
})

/** Everything the confirmation screen shows, computed by the server from the saved draft. */
export type Preview = {
  from: { address: string; name?: string }
  to: string[]
  cc: string[]
  subject: string
  /** The final text, signature included: exactly what will be sent. */
  bodyText: string
  placeholders: string[]
  flags: { newRecipients: string[]; externalDomains: string[]; foreign: ForeignDetail[] }
  contentHash: string
}

const domainOf = (a: string) => a.split('@')[1]?.toLowerCase() ?? ''

/**
 * Turns the user's final reply into the one thing that can be sent, shows it
 * back with warnings, and issues the authorization only for exactly that.
 * Sending is never started here: an authorization is released by the
 * scheduler after the undo window.
 */
export function sendConfirmation(d: {
  db: Db
  gate: SendGate
  saver: Pick<ReturnType<typeof draftSaver>, 'save'>
}) {
  async function build(
    userId: string,
    messageId: string,
    raw: unknown,
    o: { saveDraft: boolean },
  ): Promise<Result<{ content: ApprovedContent; preview: Preview }, AppFailure>> {
    const p = draftInput.safeParse(raw)
    if (!p.success)
      return err({
        kind: 'validation',
        field: String(p.error.issues[0]?.path[0] ?? ''),
        code: 'invalid',
      })
    const repos = forUser(d.db, userId)
    const row = await repos.mail.getMessage(messageId)
    const account = row ? await repos.accounts.get(row.accountId) : null
    if (!row || !account) return err({ kind: 'not_found' })
    if (account.status !== 'active') return err({ kind: 'auth', problem: 'needs_reauth' })

    if (o.saveDraft) {
      const saved = await d.saver.save(userId, messageId, {
        body: p.data.body,
        to: p.data.to,
        cc: p.data.cc,
        replyAll: p.data.replyAll,
      })
      if (!saved.ok) return saved
    }
    const draft = await repos.drafts.forMessage(messageId)
    if (!draft?.providerDraftId) return err({ kind: 'not_found' })

    const original = rowToMailMessage(row)
    const signature = (await repos.settings.get('profile.signature')) as string
    const owner = await authRepo(d.db).userById(userId)
    const content: ApprovedContent = {
      accountId: account.id,
      from: owner?.displayName
        ? { address: account.email, name: owner.displayName }
        : { address: account.email },
      to: p.data.to.map((address) => ({ address })),
      cc: p.data.cc.map((address) => ({ address })),
      subject: replySubject(original.subject),
      bodyText: withSignature(p.data.body, signature),
      inReplyToInternetMessageId: original.internetMessageId,
      draftRef: {
        providerDraftId: draft.providerDraftId,
        providerMessageId: draft.providerDraftId,
      },
    }

    const thread = row.threadId
      ? (await repos.mail.threadMessages(row.threadId)).map((t) => rowToMailMessage(t))
      : [original]
    const participants = new Set(
      thread
        .flatMap((m) => [
          m.from.address,
          ...m.to.map((a) => a.address),
          ...m.cc.map((a) => a.address),
        ])
        .map((a) => a.toLowerCase()),
    )
    const recipients = [...p.data.to, ...p.data.cc].map((a) => a.toLowerCase())
    const known = [
      ...thread.flatMap((m) => [
        m.bodyText,
        m.from.address,
        m.subject,
        ...m.to.map((a) => a.address),
        ...m.cc.map((a) => a.address),
      ]),
      account.email,
      signature,
      owner?.displayName ?? '',
    ]
    const own = domainOf(account.email)
    return ok({
      content,
      preview: {
        from: content.from,
        to: p.data.to,
        cc: p.data.cc,
        subject: content.subject,
        bodyText: content.bodyText,
        placeholders: placeholders(content.bodyText),
        flags: {
          newRecipients: recipients.filter((a) => !participants.has(a)),
          externalDomains: [...new Set(recipients.map(domainOf).filter((x) => x && x !== own))],
          foreign: scanForeignDetails(content.bodyText, known),
        },
        contentHash: contentHash(content),
      },
    })
  }

  return {
    /** Saves the draft at the provider and returns what would be sent, with warnings. Sends nothing. */
    async prepare(
      userId: string,
      messageId: string,
      raw: unknown,
    ): Promise<Result<Preview, AppFailure>> {
      const r = await build(userId, messageId, raw, { saveDraft: true })
      return r.ok ? ok(r.value.preview) : r
    },

    /**
     * Issues the authorization for exactly the previewed content. The request
     * repeats the text so the server can prove it equals what the user saw
     * ([previewHash]); any difference is refused as `content_changed`.
     */
    async authorize(
      userId: string,
      session: { id: string },
      messageId: string,
      raw: unknown,
      o: {
        previewHash: string
        placeholderOverride?: boolean
        stepUpSatisfied: boolean
        confirmedAt: Date
      },
    ): Promise<
      Result<{ nonce: string; releaseAt: Date; expiresAt: Date; ref: string }, AppFailure>
    > {
      const r = await build(userId, messageId, raw, { saveDraft: false })
      if (!r.ok) return r
      if (r.value.preview.contentHash !== o.previewHash)
        return err({ kind: 'send_refused', reason: 'content_changed' })
      const a = await d.gate.authorize(
        userId,
        r.value.content,
        { confirmedAt: o.confirmedAt, sessionId: session.id, stepUpSatisfied: o.stepUpSatisfied },
        { placeholderOverride: o.placeholderOverride },
      )
      if (!a.ok) return err({ kind: 'send_refused', reason: a.error })
      return ok({
        nonce: a.value.nonce,
        releaseAt: a.value.releaseAt,
        expiresAt: a.value.expiresAt,
        ref: d.gate.hashNonce(a.value.nonce).slice(0, 16),
      })
    },

    /** Undo. False means it was already released (too late). */
    undo: (userId: string, nonce: string) => d.gate.revoke(userId, nonce),

    /** Where an authorization stands, for the Undo bar. */
    async status(
      userId: string,
      nonce: string,
    ): Promise<{
      state:
        | 'waiting'
        | 'cancelled'
        | 'sending'
        | 'sent'
        | 'failed'
        | 'unknown'
        | 'expired'
        | 'unknown_ref'
      releaseAt?: Date
    }> {
      const repos = forUser(d.db, userId)
      const row = await repos.send.getAuthorization(d.gate.hashNonce(nonce))
      if (!row) return { state: 'unknown_ref' }
      if (row.state === 'revoked')
        return {
          state: row.endedReason === 'expired' ? 'expired' : 'cancelled',
          releaseAt: row.releaseAt,
        }
      if (row.state === 'issued')
        return {
          state: row.endedReason === 'expired' ? 'expired' : 'waiting',
          releaseAt: row.releaseAt,
        }
      if (!row.recordId) return { state: 'sending', releaseAt: row.releaseAt }
      const rec = await repos.send.getRecord(row.recordId)
      const s = rec?.status
      return {
        state:
          s === 'sent'
            ? 'sent'
            : s === 'failed'
              ? 'failed'
              : s === 'unknown'
                ? 'unknown'
                : 'sending',
        releaseAt: row.releaseAt,
      }
    },
  }
}
