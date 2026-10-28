import type { AppFailure } from '../../../shared/errors/failure'
import type { Result } from '../../../shared/errors/result'
import type { Redeemed } from './send-gate'

export type SentReceipt = { sendRecordId: string; internetMessageId: string; sentAt: Date }

/**
 * Implementations: GmailMailSender (drafts.update then drafts.send),
 * GraphMailSender (PATCH draft then POST send), ImapSmtpMailSender (SMTP
 * submission, then file in Sent unless the server does, then delete the draft).
 * A sender takes a [Redeemed] authorization, which only the gate can produce.
 */
export interface MailSender {
  /** Sends the approved reply. Exactly one attempt, never retried; the outcome is recorded. */
  send(r: Redeemed): Promise<Result<SentReceipt, AppFailure>>
  /** For `unknown` records: looks for the Message-ID in Sent. Never re-submits. */
  reconcile(userId: string, recordId: string): Promise<Result<boolean, AppFailure>>
}

/** The outcome of a submit call that did not succeed. */
export type SubmitOutcome = 'failed' | 'unknown'

const consumed = new WeakSet<object>()
/** A redeemed authorization buys one attempt: a second use of the same object is refused before touching the network. */
export function consume(r: Redeemed): boolean {
  if (consumed.has(r)) return false
  consumed.add(r)
  return true
}
export const authorizationUsed: AppFailure = { kind: 'send_refused', reason: 'already_used' }

export const sendUnknown: AppFailure = { kind: 'provider', status: null, code: 'send_unknown' }

/** Network failures that happen before anything could have been written (name lookup, refused connection). */
export function isConnectFailure(e: unknown): boolean {
  const code =
    (e as { code?: string; cause?: { code?: string } } | null)?.code ??
    (e as { cause?: { code?: string } } | null)?.cause?.code
  return (
    code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ERR_SSRF'
  )
}

/** Classifies a REST submit result: a response below 500 means the provider did not take it; a 5xx or timeout might have. */
export function classifyHttp(status: number | null, thrown?: unknown): SubmitOutcome {
  if (status !== null) return status >= 500 ? 'unknown' : 'failed'
  return isConnectFailure(thrown) ? 'failed' : 'unknown'
}

export { sendRecorder, type SendRecorder } from './records'
