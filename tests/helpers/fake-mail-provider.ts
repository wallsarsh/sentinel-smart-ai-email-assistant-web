import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { ChangeSet, MailFolder, MailMessage } from '../../shared/domain'
import type {
  DraftRef,
  FetchChangesInput,
  MailProvider,
  ReplyDraft,
} from '../../server/mail/provider'

/** In-memory provider used by service tests and as the reference for the contract suite. */
export class FakeMailProvider implements MailProvider {
  readonly type = 'imap' as const
  folders: MailFolder[] = [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true }]
  messages = new Map<string, MailMessage>()
  drafts = new Map<string, { draft: ReplyDraft; ref: DraftRef }>()
  private byKey = new Map<string, string>()
  failNext: AppFailure | null = null
  closed = false
  private n = 0

  private fail<T>(): Result<T, AppFailure> | null {
    if (!this.failNext) return null
    const f = this.failNext
    this.failNext = null
    return err(f)
  }

  async testConnection() {
    return this.fail<undefined>() ?? ok(undefined)
  }
  async listFolders() {
    return this.fail<MailFolder[]>() ?? ok(this.folders)
  }
  async fetchChanges(i: FetchChangesInput): Promise<Result<ChangeSet, AppFailure>> {
    const f = this.fail<ChangeSet>()
    if (f) return f
    const seen = Number((i.cursor as { seq?: number } | undefined)?.seq ?? 0)
    const all = [...this.messages.keys()]
    const fresh = all.slice(seen, seen + (i.maxMessages ?? 500))
    const next = seen + fresh.length
    return ok({
      newOrUpdatedIds: fresh,
      removedIds: [],
      nextCursor: { seq: next },
      hasMore: next < all.length,
    })
  }
  async getMessages(ids: string[]) {
    return this.fail<MailMessage[]>() ?? ok(ids.flatMap((id) => this.messages.get(id) ?? []))
  }
  async getThread(threadId: string) {
    return ok([...this.messages.values()].filter((m) => m.providerThreadId === threadId))
  }
  async createReplyDraft(d: ReplyDraft) {
    const f = this.fail<DraftRef>()
    if (f) return f
    const existing = this.byKey.get(d.idempotencyKey)
    if (existing) {
      const row = this.drafts.get(existing)!
      row.draft = d
      return ok(row.ref)
    }
    const id = `d${++this.n}`
    const ref: DraftRef = {
      accountId: d.accountId,
      providerDraftId: id,
      providerMessageId: `m-${id}`,
      createdAt: new Date(),
    }
    this.drafts.set(id, { draft: d, ref })
    this.byKey.set(d.idempotencyKey, id)
    return ok(ref)
  }
  async updateDraft(ref: DraftRef, d: ReplyDraft) {
    const f = this.fail<DraftRef>()
    if (f) return f
    const row = this.drafts.get(ref.providerDraftId)
    if (!row) return err<AppFailure>({ kind: 'not_found' })
    row.draft = d
    return ok(row.ref)
  }
  async deleteDraft(ref: DraftRef) {
    this.drafts.delete(ref.providerDraftId)
    return ok(undefined)
  }
  nativeLink(ref: DraftRef) {
    return `https://mail.example.test/drafts/${ref.providerDraftId}`
  }
  async close() {
    this.closed = true
  }
}
