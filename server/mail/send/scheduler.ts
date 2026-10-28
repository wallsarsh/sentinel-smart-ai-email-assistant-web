import type { Db } from '../../db/client'
import { forUser, sendScheduleAdmin } from '../../repos'
import type { SendRefusal } from '../../../shared/errors/failure'
import type { SendGate } from './send-gate'
import type { MailSender } from './support'

export type SendEvent = {
  ref: string
  state: 'sent' | 'failed' | 'unknown' | 'cancelled' | 'expired'
}

export type SchedulerDeps = {
  db: Db
  gate: SendGate
  senderFor(accountType: 'gmail' | 'microsoft_graph' | 'imap'): MailSender
  /** Tells the user's open tabs (and later push) what happened; carries a reference, never content. */
  notify?(userId: string, e: SendEvent): void
  now?: () => Date
  /** Concurrent releases per tick. */
  batch?: number
}

/**
 * Server-side delayed submit. The undo window is held here, not in the
 * browser, so closing the tab neither sends early nor loses the decision.
 * Each tick releases authorizations whose time has come: the gate's atomic
 * claim makes sure that, across any number of instances and with Undo racing,
 * a send is submitted exactly once or not at all.
 */
export function sendScheduler(d: SchedulerDeps) {
  const now = d.now ?? (() => new Date())
  const admin = sendScheduleAdmin(d.db)
  let running = false
  let timer: ReturnType<typeof setInterval> | undefined

  const ref = (hash: string) => hash.slice(0, 16)
  const endedBy: Partial<Record<SendRefusal, 'expired' | 'cancelled'>> = {
    expired: 'expired',
    revoked: 'cancelled',
  }

  async function releaseOne(userId: string, nonceHash: string): Promise<'sent' | 'skipped'> {
    const repos = forUser(d.db, userId)
    const r = await d.gate.redeem(userId, nonceHash)
    if (!r.ok) {
      const ended = endedBy[r.error]
      if (ended) {
        await repos.send.revokeAuthorization(nonceHash) // close it so it is not picked up again
        await repos.send.endAuthorization(
          nonceHash,
          ended === 'expired' ? 'expired' : 'session_ended',
        )
        d.notify?.(userId, { ref: ref(nonceHash), state: ended })
      }
      return 'skipped' // lost the race to another instance, or already finished
    }
    const account = await repos.accounts.get(r.value.accountId)
    if (!account) return 'skipped'
    const result = await d.senderFor(account.type).send(r.value)
    const rec = await repos.send.latestByHash(r.value.contentHash)
    if (rec) await repos.send.linkRecord(nonceHash, rec.id)
    d.notify?.(userId, {
      ref: ref(nonceHash),
      state: result.ok
        ? 'sent'
        : rec?.status === 'failed'
          ? 'failed'
          : rec?.status === 'unknown'
            ? 'unknown'
            : 'failed',
    })
    return 'sent'
  }

  async function tick(): Promise<{ released: number }> {
    if (running) return { released: 0 }
    running = true
    try {
      let released = 0
      for (const x of await admin.expired(now())) await releaseOne(x.userId, x.nonceHash) // closes them as expired
      const due = await admin.due(now(), d.batch ?? 10)
      await Promise.all(
        due.map(async (x) =>
          (await releaseOne(x.userId, x.nonceHash)) === 'sent' ? released++ : undefined,
        ),
      )
      return { released }
    } finally {
      running = false
    }
  }

  return {
    tick,
    start(everyMs = 1000) {
      if (timer) return
      timer = setInterval(() => void tick().catch(() => undefined), everyMs)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}
export type SendScheduler = ReturnType<typeof sendScheduler>
