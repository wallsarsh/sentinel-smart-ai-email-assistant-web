import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import type { RecordRow, SendStatus } from '../../repos/dispatch'
import type { AppFailure } from '../../../shared/errors/failure'
import type { Result } from '../../../shared/errors/result'
import type { ApprovedContent } from './approved-content'

/** Legal moves of a send record. `sent` and `failed` are final; `unknown` can only be settled by reconciling. */
export const TRANSITIONS: Record<SendStatus, SendStatus[]> = {
  pending: ['submitting', 'failed', 'cancelled'],
  submitting: ['sent', 'failed', 'unknown'],
  unknown: ['sent', 'failed'],
  sent: [],
  failed: [],
  cancelled: [],
}

/**
 * Writes the state machine of a send into `send_records`. It stores a hash and
 * counts, never the message body, and refuses any move not in [TRANSITIONS].
 */
export function sendRecorder(db: Db, now: () => Date = () => new Date()) {
  const repo = (userId: string) => forUser(db, userId).send
  const from = (to: SendStatus) =>
    (Object.keys(TRANSITIONS) as SendStatus[]).filter((s) => TRANSITIONS[s].includes(to))
  const move = (
    userId: string,
    id: string,
    to: SendStatus,
    extra: { sentAt?: Date; errorCode?: string | null } = {},
  ) => repo(userId).transition(id, from(to), to, extra)
  return {
    async begin(
      userId: string,
      c: ApprovedContent,
      o: { internetMessageId: string; contentHash: string },
    ): Promise<RecordRow> {
      return repo(userId).beginRecord({
        accountId: c.accountId,
        internetMessageId: o.internetMessageId,
        contentHash: o.contentHash,
        recipientCount: c.to.length + c.cc.length,
        approvedAt: now(),
        draftRefId: null,
        sentAt: null,
        errorCode: null,
      })
    },
    /** The provider call that submits the message is about to start. */
    submitting: (u: string, id: string) => move(u, id, 'submitting'),
    sent: (u: string, id: string) => move(u, id, 'sent', { sentAt: now() }),
    /** The provider definitely did not accept the message. */
    failed: (u: string, id: string, code: string) =>
      move(u, id, 'failed', { errorCode: code.slice(0, 60) }),
    /** Outcome uncertain: reconcile later, never resubmit. */
    unknown: (u: string, id: string) => move(u, id, 'unknown'),
    /** The user (or a closed session) stopped it before submission. */
    cancelled: (u: string, id: string) => move(u, id, 'cancelled'),
    get: (u: string, id: string) => repo(u).getRecord(id),
  }
}
export type SendRecorder = ReturnType<typeof sendRecorder>

/** The sender that can look in the right mailbox for an account type. */
export type ReconcilerFor = (accountType: 'gmail' | 'microsoft_graph' | 'imap') => {
  reconcile(userId: string, recordId: string): Promise<Result<boolean, AppFailure>>
}

/**
 * Settles `unknown` sends by looking for their Message-ID in the Sent folder.
 * It never submits anything: the only calls are searches. Returns how many
 * were found (and so became `sent`).
 */
export async function reconcileUnknown(
  d: { db: Db; reconcilerFor: ReconcilerFor },
  userId: string,
): Promise<{ checked: number; found: number }> {
  const repos = forUser(d.db, userId)
  const unknown = (await repos.send.recentRecords(100)).filter((r) => r.status === 'unknown')
  let found = 0
  for (const rec of unknown) {
    const account = await repos.accounts.get(rec.accountId)
    if (!account) continue
    const r = await d.reconcilerFor(account.type).reconcile(userId, rec.id)
    if (r.ok && r.value) found++
  }
  return { checked: unknown.length, found }
}
