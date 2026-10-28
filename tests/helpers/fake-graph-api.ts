import type { MailMessage } from '../../shared/domain'
import type { GraphCall } from '../../server/mail/graph/http'

type Draft = { id: string; categories: string[]; content: string; subject?: string }

/** In-memory Microsoft Graph: folders, delta paging, messages and reply drafts. */
export class FakeGraphApi {
  messages: MailMessage[] = []
  log: { id: string; removed: boolean }[] = []
  drafts: Draft[] = []
  down = false
  deltaGone = false
  pageSize = 100
  /** Behaviour of POST /messages/{id}/send. */
  sendStatus = 202
  sendThrows: string | null = null
  sent: { id: string; content: string; subject?: string }[] = []
  sentItems: string[] = []
  calls: string[] = []

  seed(m: MailMessage) {
    this.messages.push(m)
    this.log.push({ id: m.providerMessageId, removed: false })
  }
  remove(id: string) {
    this.messages = this.messages.filter((m) => m.providerMessageId !== id)
    this.log.push({ id, removed: true })
  }

  private wire(m: MailMessage) {
    const a = (x: { address: string; name?: string }) => ({
      emailAddress: { address: x.address, name: x.name },
    })
    return {
      id: m.providerMessageId,
      conversationId: m.providerThreadId,
      internetMessageId: m.internetMessageId,
      subject: m.subject,
      from: a(m.from),
      toRecipients: m.to.map(a),
      ccRecipients: m.cc.map(a),
      sentDateTime: m.sentAt.toISOString(),
      receivedDateTime: m.receivedAt.toISOString(),
      isRead: m.isRead,
      body: { contentType: 'text', content: m.bodyText },
      attachments: m.attachmentNames.map((name) => ({ name })),
      internetMessageHeaders: [{ name: 'References', value: m.references.join(' ') }],
    }
  }

  api: GraphCall = async (method, p, o = {}) => {
    this.calls.push(`${method} ${p}`)
    if (this.down) throw new Error('offline')
    const ok = (json: unknown) => ({ status: 200, json })
    const nf = { status: 404, json: { error: { code: 'ErrorItemNotFound' } } }
    if (/^\/mailFolders\/(inbox|sentitems|drafts|deleteditems|junkemail)$/.test(p))
      return ok({ id: p.split('/')[2]!.toUpperCase(), displayName: p.split('/')[2] })
    if (p === '/mailFolders/archive') return nf
    if (p === '/mailFolders') return ok({ value: [{ id: 'F-CLIENTS', displayName: 'Clients' }] })
    if (p.includes('/messages/delta') || p.startsWith('https://graph.microsoft.com/delta')) {
      if (this.deltaGone && p.startsWith('https://')) {
        this.deltaGone = false
        return { status: 410, json: { error: { code: 'syncStateNotFound' } } }
      }
      const start = p.startsWith('https://') ? Number(new URL(p).searchParams.get('pos')) : 0
      const end = Math.min(start + this.pageSize, this.log.length)
      const value = this.log
        .slice(start, end)
        .map((l) => (l.removed ? { id: l.id, '@removed': { reason: 'deleted' } } : { id: l.id }))
      const link = (pos: number) => `https://graph.microsoft.com/delta?pos=${pos}`
      return ok(
        end < this.log.length
          ? { value, '@odata.nextLink': link(end) }
          : { value, '@odata.deltaLink': link(end) },
      )
    }
    if (p === '/mailFolders/drafts/messages') {
      const cat = /'([^']+)'/.exec(o.query?.$filter ?? '')?.[1]
      return ok({
        value: this.drafts
          .filter((d) => !cat || d.categories.includes(cat))
          .map((d) => ({
            id: d.id,
            categories: d.categories,
            body: { contentType: 'html', content: d.content },
          })),
      })
    }
    if (p === '/messages' && method === 'GET') {
      const id = /'([^']+)'/.exec(o.query?.$filter ?? '')?.[1]
      return ok({
        value: this.messages.filter((m) => m.providerThreadId === id).map((m) => this.wire(m)),
      })
    }
    let r = /^\/messages\/([^/]+)\/createReply(All)?$/.exec(p)
    if (r) {
      const d: Draft = {
        id: `D${this.drafts.length + 1}`,
        categories: [],
        content: '<blockquote>original</blockquote>',
      }
      this.drafts.push(d)
      return {
        status: 201,
        json: { id: d.id, categories: [], body: { contentType: 'html', content: d.content } },
      }
    }
    r = /^\/messages\/([^/]+)\/send$/.exec(p)
    if (r && method === 'POST') {
      if (this.sendThrows) throw Object.assign(new Error('boom'), { code: this.sendThrows })
      const d = this.drafts.find((x) => x.id === decodeURIComponent(r![1]!))
      if (!d) return nf
      if (this.sendStatus >= 200 && this.sendStatus < 300) {
        this.sent.push({ id: d.id, content: d.content, subject: d.subject })
        this.sentItems.push(`<graph-${d.id}@x.test>`)
        this.drafts = this.drafts.filter((x) => x !== d)
        return { status: 202, json: null }
      }
      return { status: this.sendStatus, json: { error: { code: 'x' } } }
    }
    if (p === '/mailFolders/sentitems/messages') {
      const mid = /'([^']+)'/.exec(o.query?.$filter ?? '')?.[1]
      return ok({ value: this.sentItems.filter((x) => x === mid).map((id) => ({ id })) })
    }
    r = /^\/messages\/([^/]+)$/.exec(p)
    if (r) {
      const id = decodeURIComponent(r[1]!)
      const d = this.drafts.find((x) => x.id === id)
      if (method === 'GET') {
        if (d)
          return ok({
            id: d.id,
            internetMessageId: `<graph-${d.id}@x.test>`,
            categories: d.categories,
            body: { contentType: 'html', content: d.content },
          })
        const m = this.messages.find((x) => x.providerMessageId === id)
        return m ? ok(this.wire(m)) : nf
      }
      if (!d) return nf
      if (method === 'PATCH') {
        const b = o.body as { categories?: string[]; body?: { content: string }; subject?: string }
        d.categories = b.categories ?? d.categories
        d.content = b.body?.content ?? d.content
        d.subject = b.subject
        return ok({ id: d.id })
      }
      if (method === 'DELETE') {
        this.drafts = this.drafts.filter((x) => x !== d)
        return { status: 204, json: null }
      }
    }
    return { status: 400, json: {} }
  }
}
