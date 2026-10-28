import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { buildReply, draftMessageId } from '../mime/reply-builder'
import type { DraftRef, ReplyDraft } from '../provider'
import { call, type ApiCall } from './http'

export type GmailDrafts = {
  create(d: ReplyDraft): Promise<Result<DraftRef, AppFailure>>
  update(r: DraftRef, d: ReplyDraft): Promise<Result<DraftRef, AppFailure>>
  delete(r: DraftRef): Promise<Result<undefined, AppFailure>>
}

type DraftResource = {
  id: string
  message?: {
    id?: string
    threadId?: string
    payload?: { headers?: { name: string; value: string }[] }
  }
}

const OURS = /^<sentinel-/

/**
 * Reply drafts through `drafts.create/update/delete` with raw MIME. The
 * Message-ID is derived from the idempotency key, so a retried create finds the
 * existing draft (`rfc822msgid:` search) instead of adding another, and
 * update/delete refuse drafts whose Message-ID is not one of ours.
 */
export function gmailDrafts(o: {
  api: ApiCall
  accountEmail: string
  accountId: string
}): GmailDrafts {
  const { api } = o

  const raw = (d: ReplyDraft) => {
    const built = buildReply({
      original: d.inReplyTo,
      from: { address: o.accountEmail },
      to: d.to,
      cc: d.cc,
      bodyText: d.bodyText,
      subject: d.subject,
      messageId: draftMessageId(d.idempotencyKey, o.accountEmail),
    })
    return {
      message: {
        raw: Buffer.from(built.raw, 'utf8').toString('base64url'),
        ...(d.inReplyTo.providerThreadId ? { threadId: d.inReplyTo.providerThreadId } : {}),
      },
    }
  }

  const ref = (r: DraftResource): DraftRef => ({
    accountId: o.accountId,
    providerDraftId: r.id,
    providerMessageId: r.message?.id ?? null,
    createdAt: new Date(),
  })

  async function isOurs(id: string): Promise<Result<boolean, AppFailure>> {
    const r = await call<DraftResource>(api, 'GET', `/drafts/${encodeURIComponent(id)}`, {
      query: { format: 'metadata' },
    })
    if (!r.ok) return r
    const mid = r.value.message?.payload?.headers?.find(
      (h) => h.name.toLowerCase() === 'message-id',
    )
    return ok(OURS.test(mid?.value?.trim() ?? ''))
  }

  async function find(messageId: string): Promise<Result<DraftResource | null, AppFailure>> {
    const r = await call<{ drafts?: DraftResource[] }>(api, 'GET', '/drafts', {
      query: { q: `rfc822msgid:${messageId}`, maxResults: '5' },
    })
    if (!r.ok) return r
    for (const d of r.value.drafts ?? []) {
      const mine = await isOurs(d.id)
      if (mine.ok && mine.value) return ok(d)
    }
    return ok(null)
  }

  return {
    async create(d) {
      const existing = await find(draftMessageId(d.idempotencyKey, o.accountEmail))
      if (!existing.ok) return existing
      if (existing.value) {
        // Same key: bring the existing draft up to date instead of duplicating it.
        const u = await call<DraftResource>(
          api,
          'PUT',
          `/drafts/${encodeURIComponent(existing.value.id)}`,
          {
            body: { id: existing.value.id, ...raw(d) },
          },
        )
        return u.ok ? ok(ref(u.value)) : u
      }
      const r = await call<DraftResource>(api, 'POST', '/drafts', { body: raw(d) })
      return r.ok ? ok(ref(r.value)) : r
    },

    async update(r, d) {
      const mine = await isOurs(r.providerDraftId)
      if (!mine.ok) return mine
      if (!mine.value) return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
      const u = await call<DraftResource>(
        api,
        'PUT',
        `/drafts/${encodeURIComponent(r.providerDraftId)}`,
        {
          body: { id: r.providerDraftId, ...raw(d) },
        },
      )
      return u.ok ? ok({ ...ref(u.value), createdAt: r.createdAt }) : u
    },

    async delete(r) {
      const mine = await isOurs(r.providerDraftId)
      if (!mine.ok) return mine.error.kind === 'not_found' ? ok(undefined) : mine
      if (!mine.value) return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
      const d = await call(api, 'DELETE', `/drafts/${encodeURIComponent(r.providerDraftId)}`)
      return d.ok || d.error.kind === 'not_found' ? ok(undefined) : d
    },
  }
}
