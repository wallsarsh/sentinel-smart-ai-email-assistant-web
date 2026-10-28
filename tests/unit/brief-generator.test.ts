import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { briefGenerator } from '../../server/brief/generator'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { err, ok } from '../../shared/errors/result'
import { briefWindow } from '../../shared/brief'

const NOW = new Date('2026-10-28T08:00:00Z')
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

type Reply = { text: string; stop?: string } | 'fail'

async function setup(replies: Reply[]) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const repos = forUser(db, user.id)
  const acc = await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
  await repos.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
  const [folder] = await repos.mail.listFolders(acc.id)
  const prompts: string[] = []
  const tasks: string[] = []
  let i = 0
  const router = {
    complete: async (_u: string, task: string, build: (r: never) => { user: string }) => {
      tasks.push(task)
      prompts.push(build({} as never).user)
      const r = replies[Math.min(i++, replies.length - 1)]!
      if (r === 'fail') return err({ kind: 'network' as const })
      return ok({
        text: r.text,
        stop: (r.stop ?? 'end') as 'end',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        model: 'm',
        route: { providerId: 'p1', model: 'm1' },
        attempts: 1,
      } as never)
    },
  }
  const gen = briefGenerator({ db, router: router as never, now: () => NOW })
  const add = async (
    pid: string,
    o: {
      priority?: 'p1_do_now' | 'p2_today' | 'p3_this_week' | 'p4_fyi'
      category?: 'direct_personal' | 'newsletter_marketing'
      needsReply?: boolean
      summary?: string
      ageH?: number
      action?: { text: string; dueAt: Date }
    } = {},
  ) => {
    await repos.mail.upsertMessages([
      {
        accountId: acc.id,
        folderId: folder!.id,
        providerMessageId: pid,
        fromAddress: `${pid}@x.test`,
        fromName: `Sender ${pid}`,
        subject: 'secret subject',
        sentAt: NOW,
        receivedAt: new Date(NOW.getTime() - (o.ageH ?? 1) * 3_600_000),
      },
    ])
    const m = (await repos.mail.recent()).find((x) => x.providerMessageId === pid)!
    await repos.triage.save(
      {
        messageId: m.id,
        category: o.category ?? 'direct_personal',
        importance: 'medium',
        urgency: 'not_urgent',
        priority: o.priority ?? 'p3_this_week',
        needsReply: o.needsReply ?? false,
        summary: o.summary ?? `summary of ${pid}`,
        reason: 'r',
        source: 'rule',
      } as never,
      o.action ? [{ itemText: o.action.text, dueAt: o.action.dueAt, dueText: null }] : [],
    )
    return m.id
  }
  return { db, user, repos, gen, add, prompts, tasks }
}

const win = () => ({ start: new Date(NOW.getTime() - 24 * 3_600_000), end: NOW })
const reply = (sections: unknown[], headline = 'Busy day.') => ({
  text: JSON.stringify({ headline, sections }),
})

describe('brief generator', () => {
  it('maps model ids back to messages, drops unknown ids, id-less and repeated items, and caps sections', async () => {
    const s = await setup([
      reply([
        {
          type: 'topPriorities',
          items: [
            { text: 'Reply to Sender a', emailIds: ['e1', 'e1', 'e99'] },
            { text: 'Invented only', emailIds: ['e77'] },
            { text: 'No ids at all', emailIds: [] },
            { text: 'Reply to   Sender a', emailIds: ['e1'] }, // same text after tidy-up
          ],
        },
        { type: 'fyi', items: [{ text: 'Something', emailIds: ['e2'] }] },
      ]),
    ])
    const a = await s.add('a', { priority: 'p1_do_now' })
    const b = await s.add('b', { priority: 'p4_fyi' })
    const r = await s.gen.generate(s.user.id, win().start, win().end)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.sections).toEqual([
      { type: 'topPriorities', items: [{ text: 'Reply to Sender a', messageIds: [a] }] },
      { type: 'fyi', items: [{ text: 'Something', messageIds: [b] }] },
    ])
    expect(r.value.headline).toBe('Busy day.')
  })

  it('caps items per section at five', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ text: `item ${i}`, emailIds: ['e1'] }))
    const s = await setup([reply([{ type: 'fyi', items }])])
    await s.add('a', { priority: 'p2_today' })
    const r = await s.gen.generate(s.user.id, win().start, win().end)
    expect(r.ok && r.value.sections[0]!.items).toHaveLength(5)
  })

  it('the prompt carries throwaway ids only, never database ids or mail text beyond summaries', async () => {
    const s = await setup([reply([])])
    const ids = [
      await s.add('a', { priority: 'p1_do_now' }),
      await s.add('b', { priority: 'p2_today' }),
    ]
    await s.gen.generate(s.user.id, win().start, win().end)
    const p = s.prompts[0]!
    expect(p).toContain('id=e1')
    for (const id of [...ids, s.user.id]) expect(p).not.toContain(id)
    expect(p).not.toMatch(UUID_RE)
    expect(p).not.toContain('secret subject')
    expect(s.tasks[0]).toBe('brief')
  })

  it('counts come from the database; bulk FYI mail is left out of the prompt; VIP and needs-reply are flagged', async () => {
    const s = await setup([reply([])])
    await s.repos.rules.add('vip', 'a@x.test')
    await s.add('a', { priority: 'p1_do_now', needsReply: true })
    await s.add('n', { priority: 'p4_fyi', category: 'newsletter_marketing', summary: 'sale sale' })
    const r = await s.gen.generate(s.user.id, win().start, win().end)
    expect(r.ok && r.value.stats).toEqual({
      total: 2,
      needsReply: 1,
      p1: 1,
      p2: 0,
      newsletters: 1,
      notifications: 0,
    })
    expect(s.prompts[0]).toContain('(VIP)')
    expect(s.prompts[0]).toContain('needsReply')
    expect(s.prompts[0]).not.toContain('sale sale')
  })

  it('open actions due today bring older mail in, with the due date', async () => {
    const s = await setup([reply([])])
    await s.add('old', {
      priority: 'p4_fyi',
      ageH: 72,
      summary: 'contract to sign',
      action: { text: 'Sign contract', dueAt: new Date('2026-10-28T15:00:00Z') },
    })
    await s.add('later', {
      priority: 'p4_fyi',
      ageH: 80,
      summary: 'far future',
      action: { text: 'Plan', dueAt: new Date('2026-11-20T15:00:00Z') },
    })
    await s.gen.generate(s.user.id, win().start, win().end)
    expect(s.prompts[0]).toContain('contract to sign')
    expect(s.prompts[0]).toContain('Sign contract (due 2026-10-28)')
    expect(s.prompts[0]).not.toContain('far future')
  })

  it('stores the daily brief; the catch-up variant is not stored', async () => {
    const s = await setup([reply([{ type: 'fyi', items: [{ text: 'x', emailIds: ['e1'] }] }])])
    const m = await s.add('a', { priority: 'p2_today' })
    const c = await s.gen.catchUp(s.user.id, win().start, win().end)
    expect(c.ok && c.value.id).toBeNull()
    expect(await s.repos.briefs.latest()).toBeNull()
    const g = await s.gen.generate(s.user.id, win().start, win().end)
    expect(g.ok && g.value.id).toBeTruthy()
    const saved = await s.repos.briefs.latest()
    expect(saved!.row.headline).toBe('Busy day.')
    expect(saved!.items.map((i) => [i.section, i.messageIdsJson])).toEqual([['fyi', [m]]])
  })

  it('an empty window makes no model call and stores an empty brief', async () => {
    const s = await setup([reply([])])
    const r = await s.gen.generate(s.user.id, win().start, win().end)
    expect(s.prompts).toHaveLength(0)
    expect(r.ok && r.value).toMatchObject({ headline: '', sections: [] })
  })

  it('failures: model error passes through, invalid output gets one repair then fails, empty result fails', async () => {
    const f = await setup(['fail'])
    await f.add('a', { priority: 'p1_do_now' })
    expect(await f.gen.generate(f.user.id, win().start, win().end)).toEqual(
      err({ kind: 'network' }),
    )
    expect(await f.repos.briefs.latest()).toBeNull()

    const bad = await setup([{ text: '{"nope":1}' }])
    await bad.add('a', { priority: 'p1_do_now' })
    expect(await bad.gen.generate(bad.user.id, win().start, win().end)).toEqual(
      err({ kind: 'ai_output', problem: 'schema_invalid' }),
    )
    expect(bad.tasks).toEqual(['brief', 'repair'])

    const none = await setup([
      reply([{ type: 'fyi', items: [{ text: 'x', emailIds: ['zz'] }] }], ''),
    ])
    await none.add('a', { priority: 'p1_do_now' })
    expect(await none.gen.generate(none.user.id, win().start, win().end)).toEqual(
      err({ kind: 'ai_output', problem: 'empty' }),
    )
  })
})

describe('briefWindow', () => {
  const h = 3_600_000
  it('is the last 24 hours, or since the previous brief when that is older, at most a week', () => {
    expect(briefWindow(NOW, null).start).toEqual(new Date(NOW.getTime() - 24 * h))
    expect(briefWindow(NOW, new Date(NOW.getTime() - 2 * h)).start).toEqual(
      new Date(NOW.getTime() - 24 * h),
    )
    expect(briefWindow(NOW, new Date(NOW.getTime() - 48 * h)).start).toEqual(
      new Date(NOW.getTime() - 48 * h),
    )
    expect(briefWindow(NOW, new Date(NOW.getTime() - 20 * 24 * h)).start).toEqual(
      new Date(NOW.getTime() - 7 * 24 * h),
    )
  })
})
