import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { DraftRef, ReplyDraft } from '../provider'
import { callGraph, type GraphCall } from './http'

type Draft = {
  id: string
  categories?: string[]
  body?: { contentType?: string; content?: string }
}

const PREFIX = 'sentinel-'
const category = (key: string) => `${PREFIX}${key.replace(/[^A-Za-z0-9._-]/g, '')}`
const MARK = /(<div data-sentinel-reply="1">)[\s\S]*?(<\/div><!--\/sentinel-->)/

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ours = (text: string) =>
  `<div data-sentinel-reply="1">${esc(text).replace(/\r?\n/g, '<br>')}</div><!--/sentinel-->`

/** Puts our text above the quoted original that Graph generated; replaces it on later saves. */
export function mergeBody(existingHtml: string, text: string): string {
  if (MARK.test(existingHtml)) return existingHtml.replace(MARK, () => ours(text))
  return `${ours(text)}<br>${existingHtml}`
}

/**
 * Reply drafts via `createReply` (so Outlook keeps the thread and quoted
 * original). A category derived from the idempotency key marks and finds our
 * drafts: retries reuse the draft, and update/delete refuse any other message.
 */
export function graphDrafts(o: { api: GraphCall; accountId: string }) {
  const { api } = o

  const ref = (d: Draft, createdAt = new Date()): DraftRef => ({
    accountId: o.accountId,
    providerDraftId: d.id,
    providerMessageId: d.id,
    createdAt,
  })
  const patch = (d: ReplyDraft, html: string, key: string) => ({
    subject: d.subject,
    toRecipients: d.to.map((a) => ({ emailAddress: { address: a.address, name: a.name } })),
    ccRecipients: d.cc.map((a) => ({ emailAddress: { address: a.address, name: a.name } })),
    body: { contentType: 'html', content: html },
    categories: [category(key)],
  })

  async function get(id: string): Promise<Result<Draft, AppFailure>> {
    return callGraph<Draft>(api, 'GET', `/messages/${encodeURIComponent(id)}`, {
      query: { $select: 'id,categories,body' },
    })
  }
  const isOurs = (d: Draft) => (d.categories ?? []).some((c) => c.startsWith(PREFIX))

  async function save(id: string, d: ReplyDraft, current: Draft) {
    const html = mergeBody(current.body?.content ?? '', d.bodyText)
    return callGraph<Draft>(api, 'PATCH', `/messages/${encodeURIComponent(id)}`, {
      body: patch(d, html, d.idempotencyKey),
    })
  }

  return {
    async create(d: ReplyDraft): Promise<Result<DraftRef, AppFailure>> {
      const found = await callGraph<{ value?: Draft[] }>(
        api,
        'GET',
        '/mailFolders/drafts/messages',
        {
          query: {
            $filter: `categories/any(c:c eq '${category(d.idempotencyKey)}')`,
            $select: 'id,categories,body',
            $top: '1',
          },
        },
      )
      if (!found.ok) return found
      const existing = found.value.value?.[0]
      if (existing) {
        const u = await save(existing.id, d, existing)
        return u.ok ? ok(ref(existing)) : u
      }
      const created = await callGraph<Draft>(
        api,
        'POST',
        `/messages/${encodeURIComponent(d.inReplyTo.providerMessageId)}/${d.mode === 'reply_all' ? 'createReplyAll' : 'createReply'}`,
        { body: {} },
      )
      if (!created.ok) return created
      const u = await save(created.value.id, d, created.value)
      return u.ok ? ok(ref(created.value)) : u
    },

    async update(r: DraftRef, d: ReplyDraft): Promise<Result<DraftRef, AppFailure>> {
      const cur = await get(r.providerDraftId)
      if (!cur.ok) return cur
      if (!isOurs(cur.value)) return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
      const u = await save(r.providerDraftId, d, cur.value)
      return u.ok ? ok({ ...r }) : u
    },

    async delete(r: DraftRef): Promise<Result<undefined, AppFailure>> {
      const cur = await get(r.providerDraftId)
      if (!cur.ok) return cur.error.kind === 'not_found' ? ok(undefined) : cur
      if (!isOurs(cur.value)) return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
      const d = await callGraph(api, 'DELETE', `/messages/${encodeURIComponent(r.providerDraftId)}`)
      return d.ok || d.error.kind === 'not_found' ? ok(undefined) : d
    },
  }
}
