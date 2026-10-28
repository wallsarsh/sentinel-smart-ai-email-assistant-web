import type { MailMessage } from '../../shared/domain'
import type { ApiCall } from '../../server/mail/gmail/http'

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
type Draft = { id: string; messageId: string; raw: string; threadId?: string }

/** In-memory Gmail REST API: labels, messages, history, threads and drafts. */
export class FakeGmailApi {
  messages: { m: MailMessage; labels: string[]; seq: number }[] = []
  history: { id: number; added?: string; removed?: string }[] = []
  drafts: Draft[] = []
  seq = 100
  expireHistory = false
  down = false
  calls: string[] = []

  seed(m: MailMessage, labels = ['INBOX', 'UNREAD']) {
    this.messages.push({ m, labels, seq: ++this.seq })
    this.history.push({ id: this.seq, added: m.providerMessageId })
  }
  remove(id: string) {
    this.messages = this.messages.filter((x) => x.m.providerMessageId !== id)
    this.history.push({ id: ++this.seq, removed: id })
  }

  private wire(x: { m: MailMessage; labels: string[] }) {
    const m = x.m
    const addr = (a: { address: string; name?: string }) =>
      a.name ? `${a.name} <${a.address}>` : a.address
    return {
      id: m.providerMessageId,
      threadId: m.providerThreadId,
      labelIds: x.labels,
      internalDate: String(m.receivedAt.getTime()),
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: addr(m.from) },
          { name: 'To', value: m.to.map(addr).join(', ') },
          { name: 'Cc', value: m.cc.map(addr).join(', ') },
          { name: 'Subject', value: m.subject },
          { name: 'Message-ID', value: m.internetMessageId },
          { name: 'Date', value: m.sentAt.toUTCString() },
          { name: 'References', value: m.references.join(' ') },
        ],
        parts: [
          { mimeType: 'text/plain', body: { data: b64(m.bodyText) } },
          ...m.attachmentNames.map((f) => ({ mimeType: 'application/pdf', filename: f, body: {} })),
        ],
      },
    }
  }

  api: ApiCall = async (method, path, o = {}) => {
    this.calls.push(`${method} ${path}`)
    if (this.down) throw new Error('offline')
    const q = o.query ?? {}
    const one = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : (q[k] as string | undefined))
    const ok = (json: unknown) => ({ status: 200, json })
    if (path === '/profile') return ok({ historyId: String(this.seq) })
    if (path === '/labels')
      return ok({
        labels: [
          { id: 'INBOX', name: 'INBOX' },
          { id: 'SENT', name: 'SENT' },
          { id: 'DRAFT', name: 'DRAFT' },
          { id: 'Label_1', name: 'Clients' },
        ],
      })
    if (path === '/messages' && method === 'GET') {
      const label = one('labelIds')
      return ok({
        messages: this.messages
          .filter((x) => !label || x.labels.includes(label))
          .map((x) => ({ id: x.m.providerMessageId })),
      })
    }
    let r = /^\/messages\/(.+)$/.exec(path)
    if (r) {
      const x = this.messages.find((m) => m.m.providerMessageId === decodeURIComponent(r![1]!))
      return x ? ok(this.wire(x)) : { status: 404, json: {} }
    }
    r = /^\/threads\/(.+)$/.exec(path)
    if (r) {
      const ms = this.messages.filter((m) => m.m.providerThreadId === decodeURIComponent(r![1]!))
      return ms.length ? ok({ messages: ms.map((m) => this.wire(m)) }) : { status: 404, json: {} }
    }
    if (path === '/history') {
      if (this.expireHistory) return { status: 404, json: {} }
      const start = Number(one('startHistoryId'))
      const rows = this.history.filter((h) => h.id > start)
      return ok({
        history: rows.map((h) => ({
          messagesAdded: h.added ? [{ message: { id: h.added } }] : undefined,
          messagesDeleted: h.removed ? [{ message: { id: h.removed } }] : undefined,
        })),
        historyId: String(this.seq),
      })
    }
    if (path === '/drafts' && method === 'GET') {
      const mid = /rfc822msgid:(\S+)/.exec(one('q') ?? '')?.[1]
      return ok({
        drafts: this.drafts.filter((d) => !mid || d.messageId === mid).map((d) => ({ id: d.id })),
      })
    }
    if (path === '/drafts' && method === 'POST') {
      const raw = Buffer.from(
        (o.body as { message: { raw: string } }).message.raw,
        'base64url',
      ).toString('utf8')
      const d: Draft = {
        id: `d${this.drafts.length + 1}`,
        messageId: /^Message-ID: (.+)$/im.exec(raw)![1]!.trim(),
        raw,
        threadId: (o.body as { message: { threadId?: string } }).message.threadId,
      }
      this.drafts.push(d)
      return ok({ id: d.id, message: { id: `m-${d.id}`, threadId: d.threadId } })
    }
    r = /^\/drafts\/(.+)$/.exec(path)
    if (r) {
      const d = this.drafts.find((x) => x.id === r![1])
      if (!d) return { status: 404, json: {} }
      if (method === 'GET')
        return ok({
          id: d.id,
          message: {
            id: `m-${d.id}`,
            payload: { headers: [{ name: 'Message-ID', value: d.messageId }] },
          },
        })
      if (method === 'PUT') {
        d.raw = Buffer.from(
          (o.body as { message: { raw: string } }).message.raw,
          'base64url',
        ).toString('utf8')
        return ok({ id: d.id, message: { id: `m-${d.id}` } })
      }
      if (method === 'DELETE') {
        this.drafts = this.drafts.filter((x) => x !== d)
        return { status: 204, json: null }
      }
    }
    return { status: 400, json: {} }
  }
}
