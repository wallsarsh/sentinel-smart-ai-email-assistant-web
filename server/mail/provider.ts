import type { Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type {
  AccountType,
  ChangeSet,
  EmailAddress,
  MailFolder,
  MailMessage,
  SyncCursor,
} from '../../shared/domain'

export type ReplyMode = 'reply' | 'reply_all'

/** The reply a user wants saved as a draft at the provider. */
export type ReplyDraft = {
  accountId: string
  /** The message being answered (with its provider thread id). */
  inReplyTo: MailMessage
  mode: ReplyMode
  to: EmailAddress[]
  cc: EmailAddress[]
  subject: string
  bodyText: string
  /** Stable per draft: creating twice with the same key yields one draft. */
  idempotencyKey: string
}

/** Pointer to a draft Sentinel created in a mailbox. */
export type DraftRef = {
  accountId: string
  providerDraftId: string
  providerMessageId: string | null
  createdAt: Date
}

export type FetchChangesInput = {
  folder: MailFolder
  cursor?: SyncCursor
  /** First sync: only mail received at or after this time. */
  since?: Date
  maxMessages?: number
}

/**
 * Provider-neutral mailbox access (BRD FR-ACC). Read and draft operations only:
 * there is deliberately **no send method**. Sending lives in `server/mail/send/`
 * behind the send gate (WEB §2).
 */
export interface MailProvider {
  readonly type: AccountType

  /** Verifies the credentials/grant without changing anything. */
  testConnection(): Promise<Result<undefined, AppFailure>>
  listFolders(): Promise<Result<MailFolder[], AppFailure>>
  /** New, changed and removed message ids since the cursor. Never marks mail as read. */
  fetchChanges(input: FetchChangesInput): Promise<Result<ChangeSet, AppFailure>>
  getMessages(ids: string[]): Promise<Result<MailMessage[], AppFailure>>
  getThread(threadId: string): Promise<Result<MailMessage[], AppFailure>>

  createReplyDraft(draft: ReplyDraft): Promise<Result<DraftRef, AppFailure>>
  /** Only for drafts Sentinel created (found through [DraftRef]). */
  updateDraft(ref: DraftRef, draft: ReplyDraft): Promise<Result<DraftRef, AppFailure>>
  /** Only for drafts Sentinel created. Deleting a missing draft succeeds. */
  deleteDraft(ref: DraftRef): Promise<Result<undefined, AppFailure>>

  /** https link that opens the draft (or the Drafts folder) in the provider's web mail; null if none. */
  nativeLink(ref: DraftRef): string | null

  close(): Promise<void>
}

/** Method names a provider must never have; enforced by a test. */
export const FORBIDDEN_PROVIDER_METHODS = [
  'send',
  'sendMail',
  'sendMessage',
  'submit',
  'sendDraft',
  'sendReply',
] as const
