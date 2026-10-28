import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { Deadline } from '../../server/jobs/deadline'
import { jobQueue } from '../../server/jobs/queue'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import {
  enqueueRetention,
  purgeSystem,
  purgeUser,
  retentionHandler,
  RETENTION_JOB,
} from '../../worker/jobs/retention'

const NOW = new Date('2026-10-28T12:00:00Z')
const daysAgo = (n: number, extraMs = 0) => new Date(NOW.getTime() - n * 86_400_000 - extraMs)

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const repos = forUser(db, user.id)
  const acc = await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
  await repos.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
  const [folder] = await repos.mail.listFolders(acc.id)
  const add = async (pid: string, ageDays: number, o: { task?: 'open' | 'done' } = {}) => {
    await repos.mail.upsertMessages([
      {
        accountId: acc.id,
        folderId: folder!.id,
        providerMessageId: pid,
        fromAddress: 'a@x.test',
        subject: pid,
        sentAt: daysAgo(ageDays),
        receivedAt: daysAgo(ageDays),
      },
    ])
    const m = (await repos.mail.recent(100)).find((x) => x.providerMessageId === pid)!
    await repos.triage.save(
      {
        messageId: m.id,
        category: 'direct_personal',
        importance: 'medium',
        urgency: 'not_urgent',
        priority: 'p3_this_week',
        needsReply: false,
        summary: 's',
        reason: 'r',
        source: 'rule',
      } as never,
      o.task ? [{ itemText: 'do it', dueAt: null, dueText: null }] : [],
    )
    if (o.task === 'done') {
      const a = (await repos.actions.list()).find((x) => x.messageId === m.id)!
      await repos.actions.setStatus(a.id, 'done')
    }
    return m.id
  }
  return { db, user, other, repos, add }
}

describe('purgeUser', () => {
  it('deletes old mail per the retention setting but keeps mail with an open task', async () => {
    const s = await setup()
    await s.repos.settings.setMany({ 'retention.days': 30 })
    await s.add('fresh', 5)
    await s.add('edge-in', 29)
    await s.add('old', 31)
    await s.add('old-open', 90, { task: 'open' })
    await s.add('old-done', 90, { task: 'done' })
    const r = await purgeUser(s.db, s.user.id, NOW)
    expect(r.messages).toBe(2)
    expect((await s.repos.mail.recent(100)).map((m) => m.providerMessageId).sort()).toEqual([
      'edge-in',
      'fresh',
      'old-open',
    ])
    // the triage result of deleted mail went with it
    expect((await s.repos.actions.list()).map((a) => a.text)).toEqual(['do it'])
  })

  it('the setting decides: 7 days removes more than 90', async () => {
    const a = await setup()
    await a.add('m10', 10)
    await a.repos.settings.setMany({ 'retention.days': 90 })
    expect((await purgeUser(a.db, a.user.id, NOW)).messages).toBe(0)
    await a.repos.settings.setMany({ 'retention.days': 7 })
    expect((await purgeUser(a.db, a.user.id, NOW)).messages).toBe(1)
  })

  it('briefs 30 d, usage 90 d, run records 14 d, notification ledger 30 d', async () => {
    const s = await setup()
    const brief = (id: string, ageDays: number) =>
      s.repos.briefs.save({
        id,
        windowStart: daysAgo(ageDays + 1),
        windowEnd: daysAgo(ageDays),
        headline: id,
        stats: {},
        providerId: null,
        model: null,
        createdAt: daysAgo(ageDays),
        items: [],
      })
    await brief('00000000-0000-4000-8000-000000000001', 29)
    await brief('00000000-0000-4000-8000-000000000002', 31)
    const usage = (ageDays: number) =>
      s.repos.ai.recordUsage({
        model: 'm',
        task: 'triage',
        inputTokens: 1,
        outputTokens: 1,
        createdAt: daysAgo(ageDays),
      })
    await usage(89)
    await usage(91)
    await s.repos.background.startRun('periodic', null, daysAgo(13))
    await s.repos.background.startRun('periodic', null, daysAgo(15))
    await s.repos.background.claimNotification('msg:new')
    await s.repos.background.claimNotification('msg:old')
    // make "old" old
    const { notified } = await import('../../server/db/schema')
    const { eq } = await import('drizzle-orm')
    await s.db
      .update(notified)
      .set({ at: daysAgo(31) })
      .where(eq(notified.key, 'msg:old'))

    expect(await purgeUser(s.db, s.user.id, NOW)).toEqual({
      messages: 0,
      briefs: 1,
      usage: 1,
      runs: 1,
      notified: 1,
    })
    expect((await s.repos.briefs.history()).map((b) => b.headline)).toEqual([
      '00000000-0000-4000-8000-000000000001',
    ])
    expect(await s.repos.background.claimNotification('msg:new')).toBe(false) // still remembered
    expect(await s.repos.background.claimNotification('msg:old')).toBe(true) // forgotten
  })

  it("never touches another user's data and a second run finds nothing", async () => {
    const s = await setup()
    const o = forUser(s.db, s.other.id)
    await o.background.startRun('periodic', null, daysAgo(100))
    await s.add('old', 100)
    expect((await purgeUser(s.db, s.user.id, NOW)).messages).toBe(1)
    expect(await o.background.recentRuns()).toHaveLength(1)
    expect(await purgeUser(s.db, s.user.id, NOW)).toEqual({
      messages: 0,
      briefs: 0,
      usage: 0,
      runs: 0,
      notified: 0,
    })
  })

  it('stops between parts when asked to', async () => {
    const s = await setup()
    await s.repos.background.startRun('periodic', null, daysAgo(40))
    const r = await purgeUser(s.db, s.user.id, NOW, () => true)
    expect(r.runs).toBe(0)
    expect(await s.repos.background.recentRuns()).toHaveLength(1)
  })
})

describe('purgeSystem and scheduling', () => {
  it('removes expired sessions and reset tokens and old finished jobs, keeps live ones', async () => {
    const s = await setup()
    const auth = authRepo(s.db)
    const sess = (id: string, expiresAt: Date) =>
      auth.createSession({
        id,
        userId: s.user.id,
        expiresAt,
        userAgent: '',
        createdAt: daysAgo(40),
        lastSeenAt: daysAgo(40),
      })
    await sess('live', new Date(NOW.getTime() + 3_600_000))
    await sess('dead', new Date(NOW.getTime() - 1000))
    const queue = jobQueue(s.db, () => NOW)
    await queue.enqueue('x', { key: 'old' })
    await queue.enqueue('x', { key: 'recent' })
    const claimed = await queue.claim(10, 1000)
    for (const j of claimed) await queue.complete(j.id)
    // age one of the finished jobs
    await s.db.execute(
      (await import('drizzle-orm'))
        .sql`update jobs set finished_at = ${daysAgo(8).toISOString()} where key = 'old'`,
    )
    const r = await purgeSystem(s.db, queue, NOW)
    expect(r).toMatchObject({ sessions: 1, jobs: 1 })
    expect(await auth.sessionWithUser('live', NOW)).not.toBeNull()
  })

  it('queues one cleanup per user and one shared, once per day', async () => {
    const s = await setup()
    const queue = jobQueue(s.db, () => NOW)
    expect(await enqueueRetention(s.db, queue, NOW)).toBe(3) // shared + two users
    expect(await enqueueRetention(s.db, queue, NOW)).toBe(0)
    const next = new Date(NOW.getTime() + 86_400_000)
    expect(await enqueueRetention(s.db, queue, next)).toBe(3)
  })

  it('the handler cleans a user when the job has one, and the shared tables otherwise', async () => {
    const s = await setup()
    await s.add('old', 100)
    const h = retentionHandler({ db: s.db, now: () => NOW })
    const ctx = (userId: string | null) => ({
      job: {} as never,
      userId,
      deadline: new Deadline(60_000),
      payload: {},
    })
    await h(ctx(null))
    expect(await s.repos.mail.recent(100)).toHaveLength(1)
    await h(ctx(s.user.id))
    expect(await s.repos.mail.recent(100)).toHaveLength(0)
    expect(RETENTION_JOB).toBe('retention.run')
  })
})
