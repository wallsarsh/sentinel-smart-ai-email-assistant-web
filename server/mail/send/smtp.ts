import nodemailer from 'nodemailer'
import type { Db } from '../../db/client'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { parseRef } from '../imap/drafts'
import { roleOf } from '../imap/provider'
import { parseRaw } from '../imap/parse'
import type { ImapSession } from '../imap/session'
import { buildReply, newMessageId } from '../mime/reply-builder'
import { contentHash } from './approved-content'
import type { Redeemed } from './send-gate'
import {
  authorizationUsed,
  consume,
  sendRecorder,
  sendUnknown,
  type MailSender,
  type SentReceipt,
} from './support'

export type SmtpTarget = {
  host: string
  port: number
  security: 'implicit_tls' | 'start_tls'
  username: string
  password: string
  /** Server saves a copy in Sent itself (so we must not append one). */
  serverSavesSent: boolean
  /** Test seams. Production leaves these unset. */
  ignoreTLS?: boolean
  timeoutMs?: number
}

export type SmtpSenderDeps = {
  db: Db
  targetFor(userId: string, accountId: string): Promise<SmtpTarget>
  imapFor(userId: string, accountId: string): Promise<ImapSession>
  now?: () => Date
}

/**
 * A definite reply from the server (any 4xx/5xx), or an error before the
 * `DATA` command was sent, means the message was not accepted. Silence after
 * `DATA` (timeout, dropped connection) means it might have been.
 */
/**
 * A logger for nodemailer that only watches for the client's `DATA` command, so we know
 * whether the message body may have been handed over. It records nothing else (the
 * debug stream contains encoded credentials and must never be stored).
 */
function wireWatcher(onData: (started: boolean) => void) {
  const noop = () => undefined
  const watch = (_meta: unknown, ...args: unknown[]) => {
    if (String(args[0]).trim() === 'DATA') onData(true)
  }
  return {
    level: noop,
    trace: noop,
    debug: watch,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  } as never
}

export function classifySmtpError(e: unknown, o: { dataStarted: boolean }): 'failed' | 'unknown' {
  if (typeof (e as { responseCode?: number }).responseCode === 'number') return 'failed'
  return o.dataStarted ? 'unknown' : 'failed'
}

/**
 * IMAP/SMTP: submit the approved message once over SMTP; then (best effort) file
 * a copy in Sent unless the server does, and delete our draft. Housekeeping
 * never changes the outcome: the mail has already gone.
 */
export function smtpSender(d: SmtpSenderDeps): MailSender {
  const recorder = sendRecorder(d.db, d.now)
  return {
    async send(r: Redeemed): Promise<Result<SentReceipt, AppFailure>> {
      if (!consume(r)) return err(authorizationUsed)
      const c = r.content
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

      let target: SmtpTarget
      let imap: ImapSession
      let draft: { path: string; uid: number; references: string[] } | null = null
      try {
        target = await d.targetFor(r.userId, c.accountId)
        imap = await d.imapFor(r.userId, c.accountId)
      } catch {
        return fail('setup', { kind: 'auth', problem: 'needs_reauth' })
      }
      try {
        // 1. Find the saved draft only for its References chain.
        const ref = parseRef(c.draftRef.providerDraftId)
        if (ref) {
          const info = await imap.open(ref.path)
          if (info.uidValidity === ref.uidValidity) {
            const [raw] = await imap.fetch([ref.uid])
            if (raw)
              draft = {
                path: ref.path,
                uid: ref.uid,
                references: (await parseRaw('x', raw)).references,
              }
          }
        }
        if (!draft) return fail('draft_missing', { kind: 'not_found' })

        const built = buildReply({
          original: {
            providerMessageId: '',
            providerThreadId: null,
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
            references: draft.references,
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

        // 2. Submit. Exactly once.
        let dataStarted = false
        const transport = nodemailer.createTransport({
          host: target.host,
          port: target.port,
          secure: target.security === 'implicit_tls',
          requireTLS: !target.ignoreTLS && target.security === 'start_tls',
          ignoreTLS: target.ignoreTLS,
          auth: { user: target.username, pass: target.password },
          tls: { minVersion: 'TLSv1.2' },
          debug: true,
          logger: wireWatcher((started) => (dataStarted = started)),
          connectionTimeout: target.timeoutMs ?? 15_000,
          greetingTimeout: target.timeoutMs ?? 15_000,
          socketTimeout: target.timeoutMs ?? 30_000,
        })
        await recorder.submitting(r.userId, rec.id)
        try {
          await transport.sendMail({
            envelope: { from: c.from.address, to: [...c.to, ...c.cc].map((a) => a.address) },
            raw: built.raw,
          })
        } catch (e) {
          if (classifySmtpError(e, { dataStarted }) === 'failed') {
            const code = (e as { responseCode?: number }).responseCode
            return fail(
              code ? `smtp_${code}` : 'smtp_connect',
              code
                ? { kind: 'provider', status: code, code: 'smtp_rejected' }
                : { kind: 'network' },
            )
          }
          await recorder.unknown(r.userId, rec.id)
          return err(sendUnknown)
        } finally {
          transport.close()
        }
        await recorder.sent(r.userId, rec.id)

        // 3. Housekeeping. Errors here are ignored on purpose.
        try {
          if (!target.serverSavesSent) {
            const sent = (await imap.list()).find((f) => roleOf(f) === 'sent')
            if (sent) await imap.append(sent.path, built.raw, ['\\Seen'])
          }
          await imap.open(draft.path)
          await imap.remove(draft.path, [draft.uid])
        } catch {
          /* the user can tidy Drafts and Sent */
        }
        return ok({
          sendRecordId: rec.id,
          internetMessageId: messageId,
          sentAt: (d.now ?? (() => new Date()))(),
        })
      } catch {
        // Reading the draft failed: nothing was submitted.
        return fail('imap', { kind: 'network' })
      } finally {
        await imap.close().catch(() => undefined)
      }
    },

    async reconcile(userId: string, recordId: string): Promise<Result<boolean, AppFailure>> {
      const rec = await recorder.get(userId, recordId)
      if (!rec) return ok(false)
      if (rec.status === 'sent') return ok(true)
      let imap: ImapSession
      try {
        imap = await d.imapFor(userId, rec.accountId)
      } catch {
        return err({ kind: 'auth', problem: 'needs_reauth' })
      }
      try {
        const sent = (await imap.list()).find((f) => roleOf(f) === 'sent')
        if (!sent) return ok(false)
        await imap.open(sent.path)
        const found = (await imap.searchHeader('Message-ID', rec.internetMessageId)).length > 0
        if (found) await recorder.sent(userId, recordId)
        return ok(found)
      } catch {
        return err({ kind: 'network' })
      } finally {
        await imap.close().catch(() => undefined)
      }
    },
  }
}
