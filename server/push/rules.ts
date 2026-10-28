import type { Db } from '../db/client'
import { zoneOffset } from '../ai/prompts/builder'
import { forUser } from '../repos'
import { authRepo } from '../repos/auth'
import { ruleMatches } from '../triage/prefilter'
import type { PushPayload } from './payload'

export type NotifyMode = 'important' | 'needs_reply' | 'all' | 'none'

/** A daily window in minutes since local midnight: [start, end). Wraps midnight when start > end; start == end is never quiet. */
export type QuietHours = { startMinute: number; endMinute: number }

export function inQuietHours(q: QuietHours | null, minuteOfDay: number): boolean {
  if (!q || q.startMinute === q.endMinute) return false
  return q.startMinute < q.endMinute
    ? minuteOfDay >= q.startMinute && minuteOfDay < q.endMinute
    : minuteOfDay >= q.startMinute || minuteOfDay < q.endMinute
}

export type NotificationPolicy = {
  mode: NotifyMode
  mutedAccounts: ReadonlySet<string>
  quietHours: QuietHours | null
  previews: boolean
}

export const DEFAULT_POLICY: NotificationPolicy = {
  mode: 'important',
  mutedAccounts: new Set(),
  quietHours: null,
  previews: false,
}

export type Candidate = {
  accountId: string
  receivedAt: Date
  isRead: boolean
  priority: 'p1_do_now' | 'p2_today' | 'p3_this_week' | 'p4_fyi'
  needsReply: boolean
  vip: boolean
  mutedSender: boolean
}

export const MAX_AGE_MS = 24 * 3_600_000
export const MAX_PER_ACCOUNT = 5

/** Minute of the local day at [at] in [timeZone]. */
export const localMinute = (timeZone: string, at: Date) =>
  (((Math.floor(at.getTime() / 60_000) + zoneOffset(timeZone, at)) % 1440) + 1440) % 1440

/** Whether a message qualifies for a notification right now. During quiet hours nothing does; it waits and is announced after the window. */
export function shouldNotify(
  c: Candidate,
  p: NotificationPolicy,
  now: Date,
  timeZone = 'UTC',
): boolean {
  if (p.mode === 'none' || c.isRead || c.mutedSender || p.mutedAccounts.has(c.accountId))
    return false
  if (now.getTime() - c.receivedAt.getTime() > MAX_AGE_MS) return false
  if (inQuietHours(p.quietHours, localMinute(timeZone, now))) return false
  const important = c.priority === 'p1_do_now' || c.vip
  if (p.mode === 'important') return important
  if (p.mode === 'needs_reply') return important || c.needsReply
  return true
}

const validZone = (tz: string) => {
  try {
    zoneOffset(tz, new Date())
    return tz
  } catch {
    return 'UTC'
  }
}

export async function loadPolicy(db: Db, userId: string) {
  const repos = forUser(db, userId)
  const [s, user] = await Promise.all([repos.settings.all(), authRepo(db).userById(userId)])
  const a = s['notify.quietStart']
  const b = s['notify.quietEnd']
  const policy: NotificationPolicy = {
    mode: s['notify.mode'],
    mutedAccounts: new Set(s['notify.mutedAccounts']),
    quietHours: a !== null && b !== null ? { startMinute: a, endMinute: b } : null,
    previews: s['notify.previews'],
  }
  return { policy, timeZone: validZone(user?.timezone || 'UTC') }
}

export type Notifier = {
  send(userId: string, payload: PushPayload, o?: { urgency?: 'normal' | 'low' }): Promise<unknown>
}

/**
 * Notifies for new mail that qualifies. Once per message (the ledger claim),
 * at most [MAX_PER_ACCOUNT] per account and run; the rest waits for the next
 * run. Payloads carry ids only.
 */
export async function notifyNewMail(
  d: { db: Db; push: Notifier; now?: () => Date },
  userId: string,
): Promise<number> {
  const now = (d.now ?? (() => new Date()))()
  const repos = forUser(d.db, userId)
  const { policy, timeZone } = await loadPolicy(d.db, userId)
  if (policy.mode === 'none') return 0
  const rules = await repos.rules.list()
  const vips = rules
    .filter((r) => r.rule === 'vip')
    .map((r) => ({ pattern: r.pattern, kind: 'vip' as const }))
  const mutes = rules
    .filter((r) => r.rule === 'mute')
    .map((r) => ({ pattern: r.pattern, kind: 'mute' as const }))
  const rows = await repos.background.notifyCandidates(new Date(now.getTime() - MAX_AGE_MS))
  const perAccount = new Map<string, number>()
  let sent = 0
  for (const r of rows) {
    const n = perAccount.get(r.accountId) ?? 0
    if (n >= MAX_PER_ACCOUNT) continue
    const ok = shouldNotify(
      {
        ...r,
        vip: vips.some((v) => ruleMatches(v, r.fromAddress)),
        mutedSender: mutes.some((m) => ruleMatches(m, r.fromAddress)),
      },
      policy,
      now,
      timeZone,
    )
    if (!ok || !(await repos.background.claimNotification(`msg:${r.id}`))) continue
    perAccount.set(r.accountId, n + 1)
    await d.push.send(userId, { type: 'message', messageId: r.id })
    sent++
  }
  return sent
}

/** One notice per day per account that needs reconnecting. */
export async function notifyAccountIssues(
  d: { db: Db; push: Notifier; now?: () => Date },
  userId: string,
  accountIds: string[],
): Promise<number> {
  const now = (d.now ?? (() => new Date()))()
  const repos = forUser(d.db, userId)
  const { policy, timeZone } = await loadPolicy(d.db, userId)
  if (policy.mode === 'none' || inQuietHours(policy.quietHours, localMinute(timeZone, now)))
    return 0
  let sent = 0
  for (const id of accountIds) {
    if (policy.mutedAccounts.has(id)) continue
    if (!(await repos.background.claimNotification(`acct:${id}:${now.toISOString().slice(0, 10)}`)))
      continue
    await d.push.send(userId, { type: 'account', accountId: id }, { urgency: 'low' })
    sent++
  }
  return sent
}
