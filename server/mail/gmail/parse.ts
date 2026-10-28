import type { MailMessage } from '../../../shared/domain'

type Part = {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: Part[]
}
export type GmailMessage = {
  id: string
  threadId?: string
  labelIds?: string[]
  internalDate?: string
  payload?: Part
}

const dec = (d?: string) => (d ? Buffer.from(d, 'base64url').toString('utf8') : '')

function walk(p: Part, out: { text: string[]; html: string[]; files: string[] }) {
  if (p.filename) out.files.push(p.filename)
  else if (p.mimeType === 'text/plain' && p.body?.data) out.text.push(dec(p.body.data))
  else if (p.mimeType === 'text/html' && p.body?.data) out.html.push(dec(p.body.data))
  for (const c of p.parts ?? []) walk(c, out)
}

/** RFC 5322 mailbox list → addresses (handles `Name <a@b>` and bare forms). */
export function parseAddresses(v: string | undefined) {
  if (!v) return []
  const res: { address: string; name?: string }[] = []
  for (const part of v.match(/(?:"[^"]*"|[^,"])+/g) ?? []) {
    const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(part)
    const address = (m?.[2] ?? part).trim()
    if (!/^[^\s@]+@[^\s@]+$/.test(address)) continue
    const name = m?.[1]?.trim()
    res.push(name ? { address, name } : { address })
  }
  return res
}

export function decodeWords(s: string): string {
  return s.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_m, cs: string, enc: string, t: string) => {
      try {
        const buf =
          enc.toLowerCase() === 'b'
            ? Buffer.from(t, 'base64')
            : Buffer.from(
                t
                  .replace(/_/g, ' ')
                  .replace(/=([0-9A-F]{2})/gi, (_x, h: string) =>
                    String.fromCharCode(parseInt(h, 16)),
                  ),
                'latin1',
              )
        return new TextDecoder(cs).decode(buf)
      } catch {
        return t
      }
    },
  )
}

export function toMailMessage(g: GmailMessage): MailMessage {
  const h = (n: string) => g.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value
  const out = { text: [] as string[], html: [] as string[], files: [] as string[] }
  if (g.payload) walk(g.payload, out)
  const from = parseAddresses(h('from'))[0] ?? { address: 'unknown@invalid.example' }
  const received = new Date(Number(g.internalDate ?? 0))
  const sent = h('date') ? new Date(h('date')!) : received
  return {
    providerMessageId: g.id,
    providerThreadId: g.threadId ?? null,
    internetMessageId: h('message-id')?.trim() ?? '',
    from: from.name ? { ...from, name: decodeWords(from.name) } : from,
    to: parseAddresses(h('to')),
    cc: parseAddresses(h('cc')),
    subject: decodeWords(h('subject') ?? ''),
    sentAt: Number.isNaN(sent.getTime()) ? received : sent,
    receivedAt: received,
    isRead: !(g.labelIds ?? []).includes('UNREAD'),
    bodyText: out.text.join('\n'),
    bodyHtml: out.html.length ? out.html.join('\n') : null,
    attachmentNames: out.files,
    references: (h('references') ?? '').split(/\s+/).filter(Boolean),
    listUnsubscribe: h('list-unsubscribe') ?? null,
  }
}
