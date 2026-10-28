import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { failureFor, type ApiCall } from '../gmail/http'
import { buildReply, newMessageId } from '../mime/reply-builder'
import {
  authorizationUsed,
  classifyHttp,
  consume,
  sendRecorder,
  sendUnknown,
  type MailSender,
  type SentReceipt,
} from './support'
import type { Redeemed } from './send-gate'
import { contentHash } from './approved-content'

type Draft = {
  id: string
  message?: { threadId?: string; payload?: { headers?: { name: string; value: string }[] } }
}

/**
 * Gmail: update the saved draft with exactly the approved content, then
 * `drafts.send`. Each step is attempted once. If the update fails nothing was
 * sent (failed); if `drafts.send` gets a response below 500 it was not accepted
 * (failed); a 5xx or a dropped connection might have been (unknown: look in
 * Sent, never resend).
 */
export function gmailSender(d: {
  db: Db
  apiFor(userId: string, accountId: string): ApiCall
  now?: () => Date
}): MailSender {
  const recorder = sendRecorder(d.db, d.now)
  return {
    async send(r: Redeemed): Promise<Result<SentReceipt, AppFailure>> {
      if (!consume(r)) return err(authorizationUsed)
      const c = r.content
      const api = d.apiFor(r.userId, c.accountId)
      const repos = forUser(d.db, r.userId)
      const account = await repos.accounts.get(c.accountId)
      if (!account) return err({ kind: 'not_found' })

      const messageId = newMessageId(c.from.address)
      const rec = await recorder.begin(r.userId, c, {
        internetMessageId: messageId,
        contentHash: contentHash(c),
      })
      const fail = async (
        code: string,
        f: AppFailure,
      ): Promise<Result<SentReceipt, AppFailure>> => (
        await recorder.failed(r.userId, rec.id, code),
        err(f)
      )

      // 1. Read the draft only to keep its thread; the approved text replaces whatever it held.
      let threadId: string | undefined
      try {
        const cur = await api('GET', `/drafts/${encodeURIComponent(c.draftRef.providerDraftId)}`, {
          query: { format: 'metadata' },
        })
        if (cur.status < 200 || cur.status >= 300)
          return fail(
            `draft_${cur.status}`,
            cur.status === 404 ? { kind: 'not_found' } : failureFor(cur),
          )
        threadId = (cur.json as Draft).message?.threadId
      } catch {
        return fail('draft_read', { kind: 'network' })
      }

      // 2. Update the draft with the approved content.
      const built = buildReply({
        original: {
          providerMessageId: '',
          providerThreadId: threadId ?? null,
          internetMessageId: c.inReplyToInternetMessageId,
          from: c.from,
          to: [],
          cc: [],
          subject: c.subject,
          sentAt: new Date(0),
          receivedAt: new Date(0),
          isRead: true,
          bodyText: '',
          bodyHtml: null,
          attachmentNames: [],
          references: [],
          listUnsubscribe: null,
          precedence: null,
          autoSubmitted: null,
        },
        from: c.from,
        to: c.to,
        cc: c.cc,
        bodyText: c.bodyText,
        subject: c.subject,
        messageId,
      })
      try {
        const up = await api('PUT', `/drafts/${encodeURIComponent(c.draftRef.providerDraftId)}`, {
          body: {
            id: c.draftRef.providerDraftId,
            message: {
              raw: Buffer.from(built.raw, 'utf8').toString('base64url'),
              ...(threadId ? { threadId } : {}),
            },
          },
        })
        if (up.status < 200 || up.status >= 300) return fail(`update_${up.status}`, failureFor(up))
      } catch {
        return fail('update', { kind: 'network' })
      }

      // 3. Submit. Exactly once.
      await recorder.submitting(r.userId, rec.id)
      let status: number | null = null
      let thrown: unknown
      try {
        const res = await api('POST', '/drafts/send', { body: { id: c.draftRef.providerDraftId } })
        status = res.status
        if (res.status >= 200 && res.status < 300) {
          await recorder.sent(r.userId, rec.id)
          return ok({
            sendRecordId: rec.id,
            internetMessageId: messageId,
            sentAt: (d.now ?? (() => new Date()))(),
          })
        }
        if (res.status === 401) return fail('auth', { kind: 'auth', problem: 'needs_reauth' })
      } catch (e) {
        thrown = e
      }
      if (classifyHttp(status, thrown) === 'failed')
        return fail(
          status ? `send_${status}` : 'send_connect',
          status ? { kind: 'provider', status, code: String(status) } : { kind: 'network' },
        )
      await recorder.unknown(r.userId, rec.id)
      return err(sendUnknown)
    },

    /** Looks for the Message-ID in Sent. Never re-submits. */
    async reconcile(userId: string, recordId: string): Promise<Result<boolean, AppFailure>> {
      const rec = await recorder.get(userId, recordId)
      if (!rec) return ok(false)
      if (rec.status === 'sent') return ok(true)
      const api = d.apiFor(userId, rec.accountId)
      try {
        const res = await api('GET', '/messages', {
          query: { q: `rfc822msgid:${rec.internetMessageId} in:sent`, maxResults: '1' },
        })
        if (res.status < 200 || res.status >= 300) return err(failureFor(res))
        const found = ((res.json as { messages?: unknown[] })?.messages ?? []).length > 0
        if (found) await recorder.sent(userId, recordId)
        return ok(found)
      } catch {
        return err({ kind: 'network' })
      }
    },
  }
}
