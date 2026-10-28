import type { MailMessage } from '../../shared/domain'
import type { MessageRow as Row } from '../repos/mail'

type Addr = { address: string; name?: string }

/** Converts a stored message row back to the provider-neutral shape (for triage and drafting). */
export function rowToMailMessage(r: Row, providerThreadId: string | null = null): MailMessage {
  return {
    providerMessageId: r.providerMessageId,
    providerThreadId,
    internetMessageId: r.internetMessageId,
    from: r.fromName ? { address: r.fromAddress, name: r.fromName } : { address: r.fromAddress },
    to: (r.toJson as Addr[]) ?? [],
    cc: (r.ccJson as Addr[]) ?? [],
    subject: r.subject,
    sentAt: r.sentAt,
    receivedAt: r.receivedAt,
    isRead: r.isRead,
    bodyText: r.bodyText,
    bodyHtml: r.bodyHtmlSanitized,
    attachmentNames: (r.attachmentNames as string[]) ?? [],
    references: (r.referencesJson as string[]) ?? [],
    listUnsubscribe: r.listUnsubscribe,
    precedence: r.precedence,
    autoSubmitted: r.autoSubmitted,
  }
}
