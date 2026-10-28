import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import {
  DEFAULT_POLICY,
  inQuietHours,
  notifyAccountIssues,
  notifyNewMail,
  shouldNotify,
  type Candidate,
  type NotificationPolicy,
} from '../../server/push/rules'
import { pushPayload, type PushPayload } from '../../server/push/payload'

const NOW = new Date('2026-10-28T12:00:00Z')
const cand = (o: Partial<Candidate> = {}): Candidate => ({
  accountId: 'a1',
  receivedAt: new Date(NOW.getTime() - 60_000),
  isRead: false,
  priority: 'p3_this_week',
  needsReply: false,
  vip: false,
  mutedSender: false,
  ...o,
})
const pol = (o: Partial<NotificationPolicy> = {}): NotificationPolicy => ({
  ...DEFAULT_POLICY,
  ...o,
})

describe('shouldNotify mode matrix', () => {
  const cases: [string, Partial<Candidate>, boolean, boolean, boolean][] = [
    // name, candidate, important, needs_reply, all
    ['p1', { priority: 'p1_do_now' }, true, true, true],
    ['vip', { vip: true }, true, true, true],
    ['needs reply', { needsReply: true }, false, true, true],
    ['fyi', {}, false, false, true],
  ]
  it.each(cases)('%s', (_n, c, imp, nr, all) => {
    expect(shouldNotify(cand(c), pol({ mode: 'important' }), NOW)).toBe(imp)
    expect(shouldNotify(cand(c), pol({ mode: 'needs_reply' }), NOW)).toBe(nr)
    expect(shouldNotify(cand(c), pol({ mode: 'all' }), NOW)).toBe(all)
    expect(shouldNotify(cand(c), pol({ mode: 'none' }), NOW)).toBe(false)
  })

  it('never for read, muted sender, muted account or mail older than 24 hours', () => {
    const p = pol({ mode: 'all', mutedAccounts: new Set(['a2']) })
    expect(shouldNotify(cand({ isRead: true }), p, NOW)).toBe(false)
    expect(shouldNotify(cand({ mutedSender: true, vip: true }), p, NOW)).toBe(false)
    expect(shouldNotify(cand({ accountId: 'a2' }), p, NOW)).toBe(false)
    const old = (ms: number) => cand({ receivedAt: new Date(NOW.getTime() - ms) })
    expect(shouldNotify(old(24 * 3_600_000), p, NOW)).toBe(true)
    expect(shouldNotify(old(24 * 3_600_000 + 1), p, NOW)).toBe(false)
  })
})

describe('quiet hours', () => {
  it('inside a day, across midnight, empty and boundaries', () => {
    const day = { startMinute: 9 * 60, endMinute: 17 * 60 }
    expect(inQuietHours(day, 9 * 60)).toBe(true)
    expect(inQuietHours(day, 17 * 60 - 1)).toBe(true)
    expect(inQuietHours(day, 17 * 60)).toBe(false)
    const night = { startMinute: 22 * 60, endMinute: 7 * 60 }
    expect(inQuietHours(night, 23 * 60)).toBe(true)
    expect(inQuietHours(night, 6 * 60 + 59)).toBe(true)
    expect(inQuietHours(night, 7 * 60)).toBe(false)
    expect(inQuietHours(night, 12 * 60)).toBe(false)
    expect(inQuietHours({ startMinute: 60, endMinute: 60 }, 60)).toBe(false)
    expect(inQuietHours(null, 0)).toBe(false)
  })

  it('uses the user time zone and releases the mail when the window ends', () => {
    // 12:00 UTC is 21:00 in Tokyo; quiet from 20:00 to 08:00 local.
    const p = pol({ mode: 'all', quietHours: { startMinute: 20 * 60, endMinute: 8 * 60 } })
    const c = cand()
    expect(shouldNotify(c, p, NOW, 'Asia/Tokyo')).toBe(false)
    expect(shouldNotify(c, p, NOW, 'UTC')).toBe(true)
    const after = new Date('2026-10-28T23:00:00Z') // 08:00 in Tokyo
    expect(shouldNotify(cand({ receivedAt: NOW }), p, after, 'Asia/Tokyo')).toBe(true)
  })
})

describe('notifyNewMail', () => {
  async function setup(now = NOW) {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const repos = forUser(db, user.id)
    const acc = await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
    await repos.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
    const [folder] = await repos.mail.listFolders(acc.id)
    const sent: PushPayload[] = []
    const push = {
      send: async (_u: string, p: PushPayload) => void sent.push(pushPayload.parse(p)),
    }
    const add = async (
      pid: string,
      from: string,
      priority: Candidate['priority'],
      needsReply = false,
    ) => {
      await repos.mail.upsertMessages([
        {
          accountId: acc.id,
          folderId: folder!.id,
          providerMessageId: pid,
          fromAddress: from,
          subject: 'secret subject',
          sentAt: now,
          receivedAt: new Date(now.getTime() - 1000),
        },
      ])
      const m = (await repos.mail.recent()).find((x) => x.providerMessageId === pid)!
      await repos.triage.save(
        {
          messageId: m.id,
          category: 'direct_personal',
          importance: 'medium',
          urgency: 'not_urgent',
          priority,
          needsReply,
          summary: 's',
          reason: 'r',
          source: 'rule',
        } as never,
        [],
      )
      return m.id
    }
    const run = () => notifyNewMail({ db, push, now: () => now }, user.id)
    return { db, user, repos, acc, sent, add, run }
  }

  it('notifies important mail once, with ids only', async () => {
    const s = await setup()
    const id = await s.add('1', 'boss@x.test', 'p1_do_now')
    await s.add('2', 'news@x.test', 'p4_fyi')
    expect(await s.run()).toBe(1)
    expect(await s.run()).toBe(0)
    expect(s.sent).toEqual([{ type: 'message', messageId: id }])
    expect(JSON.stringify(s.sent)).not.toContain('secret')
  })

  it('VIP counts as important, muted senders never notify, user setting none silences all', async () => {
    const s = await setup()
    await s.repos.rules.add('vip', 'vip@x.test')
    await s.repos.rules.add('mute', 'loud@x.test')
    await s.add('1', 'vip@x.test', 'p4_fyi')
    await s.add('2', 'loud@x.test', 'p1_do_now')
    expect(await s.run()).toBe(1)
    await s.repos.settings.setMany({ 'notify.mode': 'none' })
    await s.add('3', 'x@x.test', 'p1_do_now')
    expect(await s.run()).toBe(0)
  })

  it('mail during quiet hours waits and is announced after the window', async () => {
    const s = await setup()
    await s.repos.settings.setMany({
      'notify.quietStart': 11 * 60,
      'notify.quietEnd': 13 * 60,
    })
    await s.add('1', 'boss@x.test', 'p1_do_now')
    expect(await s.run()).toBe(0)
    const later = notifyNewMail(
      {
        db: s.db,
        push: { send: async (_u, p) => void s.sent.push(p) },
        now: () => new Date(NOW.getTime() + 2 * 3_600_000),
      },
      s.user.id,
    )
    expect(await later).toBe(1)
  })

  it('sends at most five per account per run; the rest follows next run', async () => {
    const s = await setup()
    for (let i = 0; i < 7; i++) await s.add(`m${i}`, `p${i}@x.test`, 'p1_do_now')
    expect(await s.run()).toBe(5)
    expect(await s.run()).toBe(2)
  })

  it('reconnect notices go out once a day per account', async () => {
    const s = await setup()
    const d = {
      db: s.db,
      push: { send: async (_u: string, p: PushPayload) => void s.sent.push(p) },
      now: () => NOW,
    }
    const id = s.acc.id
    expect(await notifyAccountIssues(d, s.user.id, [id])).toBe(1)
    expect(await notifyAccountIssues(d, s.user.id, [id])).toBe(0)
    expect(s.sent).toEqual([{ type: 'account', accountId: id }])
  })
})
