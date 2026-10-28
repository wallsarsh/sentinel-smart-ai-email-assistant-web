import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { ChangeSet, FolderRole, MailFolder, MailMessage } from '../../../shared/domain'
import type { DraftRef, FetchChangesInput, MailProvider, ReplyDraft } from '../provider'
import { gmailDrafts } from './drafts'
import { call, type ApiCall } from './http'
import { toMailMessage, type GmailMessage } from './parse'

const ROLE: Record<string, FolderRole> = {
  INBOX: 'inbox',
  SENT: 'sent',
  DRAFT: 'drafts',
  TRASH: 'trash',
  SPAM: 'spam',
}
const CONCURRENCY = 5
const PAGE = 100

type Cursor = { historyId?: string; pageToken?: string }

export class GmailMailProvider implements MailProvider {
  readonly type = 'gmail' as const
  private drafts

  constructor(
    private api: ApiCall,
    o: { accountEmail: string; accountId: string },
  ) {
    this.drafts = gmailDrafts({ api, ...o })
  }

  async testConnection(): Promise<Result<undefined, AppFailure>> {
    const r = await call(this.api, 'GET', '/profile')
    return r.ok ? ok(undefined) : r
  }

  async listFolders(): Promise<Result<MailFolder[], AppFailure>> {
    const r = await call<{ labels?: { id: string; name: string; type?: string }[] }>(
      this.api,
      'GET',
      '/labels',
    )
    if (!r.ok) return r
    return ok(
      (r.value.labels ?? []).map((l) => ({
        providerId: l.id,
        name: l.name,
        role: ROLE[l.id] ?? 'other',
        processed: l.id === 'INBOX',
      })),
    )
  }

  async fetchChanges(i: FetchChangesInput): Promise<Result<ChangeSet, AppFailure>> {
    const cursor = (i.cursor ?? {}) as Cursor
    const max = Math.min(i.maxMessages ?? PAGE, 500)
    if (cursor.historyId && !cursor.pageToken) {
      const r = await this.history(i.folder.providerId, cursor.historyId, max)
      if (r.ok || r.error.kind !== 'not_found') return r
      // History expired (Gmail keeps about a week): start over from a full listing.
      return this.initial(i, {}, max)
    }
    return this.initial(i, cursor, max)
  }

  private async initial(i: FetchChangesInput, c: Cursor, max: number) {
    let historyId = c.historyId
    if (!historyId) {
      const p = await call<{ historyId: string }>(this.api, 'GET', '/profile')
      if (!p.ok) return p
      historyId = p.value.historyId
    }
    const q = i.since ? `after:${Math.floor(i.since.getTime() / 1000)}` : undefined
    const r = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(
      this.api,
      'GET',
      '/messages',
      {
        query: {
          labelIds: i.folder.providerId,
          q,
          maxResults: String(max),
          pageToken: c.pageToken,
        },
      },
    )
    if (!r.ok) return r
    const next = r.value.nextPageToken
    return ok<ChangeSet>({
      newOrUpdatedIds: (r.value.messages ?? []).map((m) => m.id),
      removedIds: [],
      nextCursor: next ? { historyId, pageToken: next } : { historyId },
      hasMore: Boolean(next),
    })
  }

  private async history(label: string, start: string, max: number) {
    const added = new Set<string>()
    const removed = new Set<string>()
    let latest = start
    let pageToken: string | undefined
    do {
      const r = await call<{
        history?: {
          messagesAdded?: { message: { id: string; labelIds?: string[] } }[]
          messagesDeleted?: { message: { id: string } }[]
          labelsAdded?: { message: { id: string } }[]
          labelsRemoved?: { message: { id: string }; labelIds?: string[] }[]
        }[]
        nextPageToken?: string
        historyId?: string
      }>(this.api, 'GET', '/history', {
        query: {
          startHistoryId: start,
          labelId: label,
          historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
          maxResults: String(max),
          pageToken,
        },
      })
      if (!r.ok) return r
      for (const h of r.value.history ?? []) {
        for (const m of h.messagesAdded ?? []) added.add(m.message.id)
        for (const m of h.labelsAdded ?? []) added.add(m.message.id)
        for (const m of h.messagesDeleted ?? []) removed.add(m.message.id)
        for (const m of h.labelsRemoved ?? [])
          if (m.labelIds?.includes(label)) removed.add(m.message.id)
      }
      latest = r.value.historyId ?? latest
      pageToken = r.value.nextPageToken
    } while (pageToken)
    for (const id of removed) added.delete(id)
    return ok<ChangeSet>({
      newOrUpdatedIds: [...added],
      removedIds: [...removed],
      nextCursor: { historyId: latest },
      hasMore: false,
    })
  }

  async getMessages(ids: string[]): Promise<Result<MailMessage[], AppFailure>> {
    const out: MailMessage[] = []
    for (let n = 0; n < ids.length; n += CONCURRENCY) {
      const rs = await Promise.all(
        ids.slice(n, n + CONCURRENCY).map((id) =>
          call<GmailMessage>(this.api, 'GET', `/messages/${encodeURIComponent(id)}`, {
            query: { format: 'full' },
          }),
        ),
      )
      for (const r of rs) {
        if (r.ok) out.push(toMailMessage(r.value))
        else if (r.error.kind !== 'not_found') return err(r.error) // deleted meanwhile is fine
      }
    }
    return ok(out)
  }

  async getThread(threadId: string): Promise<Result<MailMessage[], AppFailure>> {
    const r = await call<{ messages?: GmailMessage[] }>(
      this.api,
      'GET',
      `/threads/${encodeURIComponent(threadId)}`,
      { query: { format: 'full' } },
    )
    return r.ok ? ok((r.value.messages ?? []).map(toMailMessage)) : r
  }

  createReplyDraft = (d: ReplyDraft) => this.drafts.create(d)
  updateDraft = (r: DraftRef, d: ReplyDraft) => this.drafts.update(r, d)
  deleteDraft = (r: DraftRef) => this.drafts.delete(r)

  nativeLink(ref: DraftRef): string | null {
    return `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(ref.providerMessageId ?? ref.providerDraftId)}`
  }

  async close() {}
}
