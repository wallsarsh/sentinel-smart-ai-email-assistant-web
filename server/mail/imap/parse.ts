import { simpleParser, type AddressObject } from 'mailparser'
import type { EmailAddress, MailMessage } from '../../../shared/domain'
import type { RawMessage } from './session'

const addrs = (a: AddressObject | AddressObject[] | undefined): EmailAddress[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((o) =>
    o.value.flatMap((v) =>
      v.address ? [v.name ? { address: v.address, name: v.name } : { address: v.address }] : [],
    ),
  )

/** Thread id = first Message-ID of the chain (References[0]), else the message's own id. */
export const threadKey = (references: string[], messageId: string) => references[0] ?? messageId

export async function parseRaw(id: string, raw: RawMessage): Promise<MailMessage> {
  const p = await simpleParser(raw.source)
  const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : []
  const mid = p.messageId ?? ''
  const unsub = p.headers.get('list-unsubscribe')
  const from = addrs(p.from)[0] ?? { address: 'unknown@invalid.example' }
  return {
    providerMessageId: id,
    providerThreadId: threadKey(refs, mid) || null,
    internetMessageId: mid,
    from,
    to: addrs(p.to),
    cc: addrs(p.cc),
    subject: p.subject ?? '',
    sentAt: p.date ?? raw.internalDate,
    receivedAt: raw.internalDate,
    isRead: raw.flags.includes('\\Seen'),
    bodyText: p.text ?? '',
    bodyHtml: typeof p.html === 'string' ? p.html : null,
    attachmentNames: p.attachments.flatMap((a) => (a.filename ? [a.filename] : [])),
    references: refs,
    listUnsubscribe: typeof unsub === 'string' ? unsub : null,
  }
}
