import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import type { SubscriptionRow } from '../repos/push'
import type { AppFailure } from '../../shared/errors/failure'
import { err, ok, type Result } from '../../shared/errors/result'
import { pushPayload, PUSH_ACTIONS, type PushPayload } from './payload'

/** Delivers one encoded payload to one browser. Returns the push service's HTTP status. */
export type PushTransport = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
  o: { ttl: number; urgency: 'normal' | 'low' },
) => Promise<{ status: number }>

const subscription = z.object({
  endpoint: z
    .url()
    .max(1000)
    .refine((u) => u.startsWith('https://'), 'https only'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
})

export type PushDeps = { db: Db; transport: PushTransport; now?: () => Date }
export type SendReport = { delivered: number; removed: number; failed: number }

export function pushService(d: PushDeps) {
  const now = d.now ?? (() => new Date())
  const repos = (u: string) => forUser(d.db, u)
  return {
    async subscribe(
      userId: string,
      input: unknown,
      userAgent = '',
    ): Promise<Result<{ id: string }, AppFailure>> {
      const p = subscription.safeParse(input)
      if (!p.success) return err({ kind: 'validation', field: 'subscription', code: 'invalid' })
      const row = await repos(userId).push.upsert({
        endpoint: p.data.endpoint,
        p256dh: p.data.keys.p256dh,
        auth: p.data.keys.auth,
        userAgent: userAgent.slice(0, 200),
      })
      return ok({ id: row.id })
    },

    unsubscribe: (userId: string, endpoint: string) =>
      repos(userId).push.removeByEndpoint(endpoint),

    /** Devices for the settings screen (never the keys). */
    async devices(userId: string) {
      return (await repos(userId).push.list()).map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        failing: s.failedAt !== null,
      }))
    },

    removeDevice: (userId: string, id: string) => repos(userId).push.removeById(id),

    /**
     * Sends [payload] to all of the user's devices. The payload is validated
     * first: only a kind and ids are allowed. Gone subscriptions (404/410) are
     * deleted; other failures are marked so repeated failures can be cleaned up.
     */
    async send(
      userId: string,
      payload: PushPayload,
      o: { ttl?: number; urgency?: 'normal' | 'low' } = {},
    ): Promise<SendReport> {
      const body = JSON.stringify(pushPayload.parse(payload)) // throws on any extra field
      const report: SendReport = { delivered: 0, removed: 0, failed: 0 }
      const subs: SubscriptionRow[] = await repos(userId).push.list()
      for (const s of subs) {
        const status = await d
          .transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            ttl: o.ttl ?? 3600,
            urgency: o.urgency ?? 'normal',
          })
          .then(
            (r) => r.status,
            () => 0,
          )
        if (status >= 200 && status < 300) {
          report.delivered++
          if (s.failedAt)
            await repos(userId).push.upsert({
              endpoint: s.endpoint,
              p256dh: s.p256dh,
              auth: s.auth,
              userAgent: s.userAgent,
            })
        } else if (status === 404 || status === 410) {
          await repos(userId).push.removeById(s.id)
          report.removed++
        } else {
          await repos(userId).push.markFailed(s.id, now())
          report.failed++
        }
      }
      return report
    },

    /** Removes subscriptions that have been failing for [days] days. */
    cleanup: (userId: string, days = 7) =>
      repos(userId).push.removeFailedBefore(new Date(now().getTime() - days * 86_400_000)),
  }
}
export type PushService = ReturnType<typeof pushService>
export { PUSH_ACTIONS }
