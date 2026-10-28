import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { ChangeSet, FolderRole, MailFolder, MailMessage } from '../../../shared/domain'
import type { DraftRef, FetchChangesInput, MailProvider, ReplyDraft } from '../provider'
import { graphDrafts } from './drafts'
import { callGraph, GRAPH, isGraphUrl, type GraphCall } from './http'
import { toMailMessage, type GraphMessage } from './parse'

const WELL_KNOWN: [string, FolderRole][] = [
  ['inbox', 'inbox'],
  ['sentitems', 'sent'],
  ['drafts', 'drafts'],
  ['deleteditems', 'trash'],
  ['junkemail', 'spam'],
  ['archive', 'archive'],
]
const SELECT =
  'id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isRead,body'
const PAGE = 50
const TEXT = { Prefer: 'outlook.body-content-type="text"' }

type Cursor = { nextLink?: string; deltaLink?: string }
type Delta = {
  value?: ({ id: string; '@removed'?: unknown } & Partial<GraphMessage>)[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

export class GraphMailProvider implements MailProvider {
  readonly type = 'microsoft_graph' as const
  private drafts

  constructor(
    private api: GraphCall,
    o: { accountId: string },
  ) {
    this.drafts = graphDrafts({ api, ...o })
  }

  async testConnection(): Promise<Result<undefined, AppFailure>> {
    const r = await callGraph(this.api, 'GET', '/mailFolders/inbox', { query: { $select: 'id' } })
    return r.ok ? ok(undefined) : r
  }

  async listFolders(): Promise<Result<MailFolder[], AppFailure>> {
    const seen = new Map<string, MailFolder>()
    for (const [wk, role] of WELL_KNOWN) {
      const r = await callGraph<{ id: string; displayName: string }>(
        this.api,
        'GET',
        `/mailFolders/${wk}`,
        {
          query: { $select: 'id,displayName' },
        },
      )
      if (r.ok)
        seen.set(r.value.id, {
          providerId: r.value.id,
          name: r.value.displayName,
          role,
          processed: role === 'inbox',
        })
      else if (r.error.kind !== 'not_found') return r // archive may not exist
    }
    const all = await callGraph<{ value?: { id: string; displayName: string }[] }>(
      this.api,
      'GET',
      '/mailFolders',
      {
        query: { $top: '100', $select: 'id,displayName' },
      },
    )
    if (!all.ok) return all
    for (const f of all.value.value ?? [])
      if (!seen.has(f.id))
        seen.set(f.id, { providerId: f.id, name: f.displayName, role: 'other', processed: false })
    return ok([...seen.values()])
  }

  async fetchChanges(i: FetchChangesInput): Promise<Result<ChangeSet, AppFailure>> {
    const c = (i.cursor ?? {}) as Cursor
    const link = c.nextLink ?? c.deltaLink
    if (link && !isGraphUrl(link))
      return err({ kind: 'validation', field: 'cursor', code: 'bad_cursor' })
    const r = link ? await this.page(link) : await this.firstPage(i)
    if (!r.ok && link && r.error.kind === 'provider' && r.error.status === 410) {
      // Delta token expired (syncStateNotFound): restart from a full listing.
      return this.finish(await this.firstPage(i))
    }
    return this.finish(r)
  }

  private firstPage(i: FetchChangesInput) {
    return callGraph<Delta>(
      this.api,
      'GET',
      `/mailFolders/${encodeURIComponent(i.folder.providerId)}/messages/delta`,
      {
        query: {
          $select: 'id',
          ...(i.since ? { $filter: `receivedDateTime ge ${i.since.toISOString()}` } : {}),
        },
        headers: { Prefer: `odata.maxpagesize=${Math.min(i.maxMessages ?? PAGE, 100)}` },
      },
    )
  }

  private page(url: string) {
    return callGraph<Delta>(this.api, 'GET', url)
  }

  private finish(r: Result<Delta, AppFailure>): Result<ChangeSet, AppFailure> {
    if (!r.ok) return r
    const rows = r.value.value ?? []
    const next = r.value['@odata.nextLink']
    const delta = r.value['@odata.deltaLink']
    return ok({
      newOrUpdatedIds: rows.filter((x) => !x['@removed']).map((x) => x.id),
      removedIds: rows.filter((x) => x['@removed']).map((x) => x.id),
      nextCursor: next ? { nextLink: next } : { deltaLink: delta ?? '' },
      hasMore: Boolean(next),
    })
  }

  async getMessages(ids: string[]): Promise<Result<MailMessage[], AppFailure>> {
    const out: MailMessage[] = []
    for (let n = 0; n < ids.length; n += 5) {
      const rs = await Promise.all(
        ids.slice(n, n + 5).map((id) =>
          callGraph<GraphMessage>(this.api, 'GET', `/messages/${encodeURIComponent(id)}`, {
            query: {
              $select: `${SELECT},internetMessageHeaders`,
              $expand: 'attachments($select=name)',
            },
            headers: TEXT,
          }),
        ),
      )
      for (const r of rs) {
        if (r.ok) out.push(toMailMessage(r.value))
        else if (r.error.kind !== 'not_found') return err(r.error)
      }
    }
    return ok(out)
  }

  async getThread(threadId: string): Promise<Result<MailMessage[], AppFailure>> {
    const r = await callGraph<{ value?: GraphMessage[] }>(this.api, 'GET', '/messages', {
      query: {
        $filter: `conversationId eq '${threadId.replace(/'/g, "''")}'`,
        $select: SELECT,
        $expand: 'attachments($select=name)',
        $top: '50',
      },
      headers: TEXT,
    })
    return r.ok ? ok((r.value.value ?? []).map(toMailMessage)) : r
  }

  createReplyDraft = (d: ReplyDraft) => this.drafts.create(d)
  updateDraft = (r: DraftRef, d: ReplyDraft) => this.drafts.update(r, d)
  deleteDraft = (r: DraftRef) => this.drafts.delete(r)

  nativeLink(ref: DraftRef): string | null {
    return `https://outlook.office.com/mail/deeplink/compose/${encodeURIComponent(ref.providerDraftId)}`
  }

  async close() {}
}

export { GRAPH }
