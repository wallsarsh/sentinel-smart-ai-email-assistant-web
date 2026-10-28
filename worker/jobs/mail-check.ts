import type { Db } from '../../server/db/client'
import type { Deadline } from '../../server/jobs/deadline'
import { DeadlineExceeded } from '../../server/jobs/deadline'
import type { JobHandler } from '../../server/jobs/runner'
import type { MailProvider } from '../../server/mail/provider'
import { forUser } from '../../server/repos'
import { syncUser } from '../../server/sync/sync-account'
import type { TriageService } from '../../server/triage/service'
import type { AppFailure } from '../../shared/errors/failure'

export type MailCheckPorts = {
  /** Syncs all of the user's accounts. */
  sync(userId: string): Promise<{ newMessages: number; errors: Record<string, AppFailure> }>
  /** Deterministic labelling of everything still unlabelled (no AI). */
  triageRules(userId: string): Promise<{ processed: number }>
  /** Model triage for at most [limit] queued messages. */
  triageAi(userId: string, limit: number): Promise<{ processed: number; failure?: AppFailure }>
  /** Posts notifications for mail that qualifies (idempotent). */
  notifyNewMail?(userId: string): Promise<void>
  /** One "reconnect needed" notice for accounts that need it. */
  notifyAccountIssues?(userId: string, accountIds: string[]): Promise<void>
  aiEnabled(userId: string): Promise<boolean>
  /** Writes today's brief when it is due. */
  briefStep?(userId: string, deadline: Deadline): Promise<void>
  accountsNeedingReauth(userId: string): Promise<string[]>
  startRun(userId: string, trigger: string): Promise<string>
  finishRun(
    userId: string,
    id: string,
    v: { outcome: string; newMessages: number; triaged: number; errorCode?: string | null },
  ): Promise<void>
}

export type MailCheckOptions = { triageChunk?: number; minAiMs?: number }

/**
 * sync → rules → notify → AI triage as time allows. Every step is
 * cursor-based or checks for existing results, so stopping between steps or
 * repeating a run loses and duplicates nothing. This job only reads mail,
 * labels it and notifies; it has no way to send or write drafts.
 */
export function mailCheck(ports: MailCheckPorts, o: MailCheckOptions = {}): JobHandler {
  const chunk = o.triageChunk ?? 16
  const minAi = o.minAiMs ?? 6000
  return async (ctx) => {
    if (!ctx.userId) return
    const userId = ctx.userId
    const trigger = String(ctx.payload.trigger ?? 'periodic')
    const run = await ports.startRun(userId, trigger)
    let newMessages = 0
    let triaged = 0
    let outcome = 'ok'
    let errorCode: string | null = null
    try {
      ctx.deadline.check()
      const synced = await ports.sync(userId)
      newMessages = synced.newMessages
      const failed = Object.values(synced.errors)
      if (failed.length) {
        outcome = 'partial'
        errorCode = failed[0]!.kind
      }
      const reauth = await ports.accountsNeedingReauth(userId)
      if (reauth.length) await ports.notifyAccountIssues?.(userId, reauth)

      ctx.deadline.check()
      triaged += (await ports.triageRules(userId)).processed
      await ports.notifyNewMail?.(userId)

      if (await ports.aiEnabled(userId)) {
        while (ctx.deadline.canStart(minAi)) {
          const step = await ports.triageAi(userId, chunk)
          triaged += step.processed
          if (step.failure) {
            outcome = 'partial'
            errorCode = step.failure.kind // cap, consent or network: the rest stays queued
            break
          }
          if (step.processed === 0) break
          await ports.notifyNewMail?.(userId) // AI results can change what deserves a notification
        }
      }
      if (ports.briefStep && ctx.deadline.canStart(minAi))
        await ports.briefStep(userId, ctx.deadline)
      // A sync that failed everywhere is worth a retry with backoff.
      if (
        outcome === 'partial' &&
        newMessages === 0 &&
        failed.length > 0 &&
        failed.every((f) => ['network', 'provider', 'rate_limited'].includes(f.kind))
      ) {
        await ports.finishRun(userId, run, { outcome: 'error', newMessages, triaged, errorCode })
        throw new Error('mail_check_failed_retryable')
      }
    } catch (e) {
      if (e instanceof DeadlineExceeded) {
        await ports.finishRun(userId, run, {
          outcome: 'timeout',
          newMessages,
          triaged,
          errorCode: 'deadline',
        })
        throw e
      }
      if (!(e instanceof Error && e.message === 'mail_check_failed_retryable'))
        await ports.finishRun(userId, run, {
          outcome: 'error',
          newMessages,
          triaged,
          errorCode: e instanceof Error ? e.name : 'error',
        })
      throw e
    }
    await ports.finishRun(userId, run, { outcome, newMessages, triaged, errorCode })
  }
}

/** The real ports over the worker's services. */
export function defaultPorts(d: {
  db: Db
  providerFor(userId: string, accountId: string): Promise<MailProvider>
  triage: Pick<TriageService, 'triagePending'>
  onPage?: (userId: string, p: { added: string[]; removed: number }) => void
}): MailCheckPorts {
  const repos = (u: string) => forUser(d.db, u)
  return {
    async sync(userId) {
      const res = await syncUser({
        db: d.db,
        userId,
        providerFor: (id) => d.providerFor(userId, id),
        onPage: (p) => d.onPage?.(userId, p),
      })
      let newMessages = 0
      const errors: Record<string, AppFailure> = {}
      for (const [id, r] of Object.entries(res)) {
        newMessages += r.added
        if (!r.ok) errors[id] = r.error
      }
      return { newMessages, errors }
    },
    async triageRules(userId) {
      const r = await d.triage.triagePending(userId, { useAi: false, limit: 200 })
      return { processed: r.byRule }
    },
    async triageAi(userId, limit) {
      const r = await d.triage.triagePending(userId, { useAi: true, limit })
      return {
        processed: r.byAi + r.unclassified + r.byRule,
        ...(r.failure ? { failure: r.failure } : {}),
      }
    },
    aiEnabled: async (userId) => (await repos(userId).settings.get('bg.aiEnabled')) as boolean,
    accountsNeedingReauth: async (userId) =>
      (await repos(userId).accounts.list())
        .filter((a) => a.status === 'needs_reauth')
        .map((a) => a.id),
    startRun: (userId, trigger) => repos(userId).background.startRun(trigger),
    finishRun: (userId, id, v) => repos(userId).background.finishRun(id, v),
  }
}
