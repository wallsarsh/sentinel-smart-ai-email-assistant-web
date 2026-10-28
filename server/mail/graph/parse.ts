import type { MailMessage } from '../../../shared/domain'

type Addr = { emailAddress?: { address?: string; name?: string } }
export type GraphMessage = {
  id: string
  conversationId?: string
  internetMessageId?: string
  subject?: string
  from?: Addr
  toRecipients?: Addr[]
  ccRecipients?: Addr[]
  sentDateTime?: string
  receivedDateTime?: string
  isRead?: boolean
  body?: { contentType?: string; content?: string }
  attachments?: { name?: string }[]
  internetMessageHeaders?: { name: string; value: string }[]
}

const addr = (a: Addr | undefined) => {
  const e = a?.emailAddress
  return e?.address
    ? e.name
      ? { address: e.address, name: e.name }
      : { address: e.address }
    : null
}
const list = (xs: Addr[] | undefined) => (xs ?? []).flatMap((x) => addr(x) ?? [])

export function toMailMessage(g: GraphMessage): MailMessage {
  const hdr = (n: string) =>
    g.internetMessageHeaders?.find((h) => h.name.toLowerCase() === n)?.value
  const html = g.body?.contentType === 'html'
  const received = new Date(g.receivedDateTime ?? 0)
  return {
    providerMessageId: g.id,
    providerThreadId: g.conversationId ?? null,
    internetMessageId: g.internetMessageId ?? '',
    from: addr(g.from) ?? { address: 'unknown@invalid.example' },
    to: list(g.toRecipients),
    cc: list(g.ccRecipients),
    subject: g.subject ?? '',
    sentAt: g.sentDateTime ? new Date(g.sentDateTime) : received,
    receivedAt: received,
    isRead: g.isRead ?? false,
    bodyText: html ? '' : (g.body?.content ?? ''),
    bodyHtml: html ? (g.body?.content ?? null) : null,
    attachmentNames: (g.attachments ?? []).flatMap((a) => (a.name ? [a.name] : [])),
    references: (hdr('references') ?? '').split(/\s+/).filter(Boolean),
    listUnsubscribe: hdr('list-unsubscribe') ?? null,
  }
}
