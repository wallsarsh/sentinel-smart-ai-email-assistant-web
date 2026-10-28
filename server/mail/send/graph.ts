import type { Db } from '../../db/client'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { graphFailure, type GraphCall } from '../graph/http'
import { mergeBody } from '../graph/drafts'
import { contentHash } from './approved-content'
import type { Redeemed } from './send-gate'
import {
  authorizationUsed,
  classifyHttp,
  consume,
  sendRecorder,
  sendUnknown,
  type MailSender,
  type SentReceipt,
} from './support'

type Draft = { id: string; internetMessageId?: string; body?: { content?: string } }
const addr = (a: { address: string; name?: string }) => ({
  emailAddress: { address: a.address, name: a.name },
})

/**
 * Microsoft Graph: PATCH the saved draft with exactly the approved content,
 * then `POST /me/messages/{id}/send` once. The draft already has its
 * Message-ID, which is recorded so an uncertain outcome can be looked up in
 * Sent Items. A response below 500 means not accepted (failed); a 5xx or a
 * dropped connection might have been accepted (unknown, never resent).
 */
export function graphSender(d: {
  db: Db
  apiFor(userId: string, accountId: string): GraphCall
  now?: () => Date
}): MailSender {
  const recorder = sendRecorder(d.db, d.now)
  return {
    async send(r: Redeemed): Promise<Result<SentReceipt, AppFailure>> {
      if (!consume(r)) return err(authorizationUsed)
      const c = r.content
      const api = d.apiFor(r.userId, c.accountId)
      const id = encodeURIComponent(c.draftRef.providerDraftId)

      // 1. The draft: its Message-ID and the quoted original we keep below our text.
      let draft: Draft
      try {
        const cur = await api('GET', `/messages/${id}`, {
          query: { $select: 'id,internetMessageId,body' },
        })
        if (cur.status < 200 || cur.status >= 300) {
          const rec = await recorder.begin(r.userId, c, {
            internetMessageId: '',
            contentHash: contentHash(c),
          })
          await recorder.failed(r.userId, rec.id, `draft_${cur.status}`)
          return err(cur.status === 404 ? { kind: 'not_found' } : graphFailure(cur))
        }
        draft = cur.json as Draft
      } catch {
        const rec = await recorder.begin(r.userId, c, {
          internetMessageId: '',
          contentHash: contentHash(c),
        })
        await recorder.failed(r.userId, rec.id, 'draft_read')
        return err({ kind: 'network' })
      }
      const rec = await recorder.begin(r.userId, c, {
        internetMessageId: draft.internetMessageId ?? '',
        contentHash: contentHash(c),
      })
      const fail = async (
        code: string,
        f: AppFailure,
      ): Promise<Result<SentReceipt, AppFailure>> => (
        await recorder.failed(r.userId, rec.id, code),
        err(f)
      )

      // 2. Update the draft with the approved content.
      try {
        const up = await api('PATCH', `/messages/${id}`, {
          body: {
            subject: c.subject,
            toRecipients: c.to.map(addr),
            ccRecipients: c.cc.map(addr),
            body: {
              contentType: 'html',
              content: mergeBody(draft.body?.content ?? '', c.bodyText),
            },
          },
        })
        if (up.status < 200 || up.status >= 300)
          return fail(`update_${up.status}`, graphFailure(up))
      } catch {
        return fail('update', { kind: 'network' })
      }

      // 3. Submit. Exactly once.
      await recorder.submitting(r.userId, rec.id)
      let status: number | null = null
      let thrown: unknown
      try {
        const res = await api('POST', `/messages/${id}/send`)
        status = res.status
        if (res.status >= 200 && res.status < 300) {
          await recorder.sent(r.userId, rec.id)
          return ok({
            sendRecordId: rec.id,
            internetMessageId: draft.internetMessageId ?? '',
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

    async reconcile(userId: string, recordId: string): Promise<Result<boolean, AppFailure>> {
      const rec = await recorder.get(userId, recordId)
      if (!rec) return ok(false)
      if (rec.status === 'sent') return ok(true)
      if (!rec.internetMessageId) return ok(false)
      try {
        const res = await d.apiFor(userId, rec.accountId)(
          'GET',
          '/mailFolders/sentitems/messages',
          {
            query: {
              $filter: `internetMessageId eq '${rec.internetMessageId.replace(/'/g, "''")}'`,
              $select: 'id',
              $top: '1',
            },
          },
        )
        if (res.status < 200 || res.status >= 300) return err(graphFailure(res))
        const found = ((res.json as { value?: unknown[] })?.value ?? []).length > 0
        if (found) await recorder.sent(userId, recordId)
        return ok(found)
      } catch {
        return err({ kind: 'network' })
      }
    },
  }
}
