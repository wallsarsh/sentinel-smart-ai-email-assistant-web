import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { actionItems, messages, triageResults } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { AI_EXCLUDED_REASON, triageService, UNCLASSIFIED_REASON } from '../../server/triage/service'
import { err, ok } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { AiTask, StopReason } from '../../server/ai/types'

type Answer = { text: string; stop?: StopReason } | AppFailure
type Call = { task: AiTask; user: string; maxTokens: number }

async function setup(
  opts: { answers: Answer[] | ((c: Call, n: number) => Answer); batchSize?: number } = {
    answers: [],
  },
) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({
    email: 'u@x.io',
    passwordHash: 'h',
    displayName: 'Priya',
    timezone: 'Europe/Berlin',
  })
  const repos = forUser(db, user.id)
  const acc = await repos.accounts.create({
    type: 'imap',
    email: 'me@x.test',
    displayName: '',
    color: 1,
  })
  const acc2 = await repos.accounts.create({
    type: 'imap',
    email: 'ex@x.test',
    displayName: '',
    color: 1,
  })
  await repos.accounts.update(acc2.id, { aiExcluded: true })
  await repos.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  await repos.mail.upsertFolders(acc2.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const f1 = (await repos.mail.listFolders(acc.id))[0]!
  const f2 = (await repos.mail.listFolders(acc2.id))[0]!
  const calls: Call[] = []
  const router = {
    async complete(
      _u: string,
      task: AiTask,
      build: (r: { providerId: string; model: string; params: object }) => {
        user: string
        maxTokens: number
      },
    ) {
      const route = {
        providerId: '00000000-0000-4000-8000-000000000001',
        model: 'test-model',
        params: {},
      }
      const b = build(route)
      const call = { task, user: b.user, maxTokens: b.maxTokens }
      calls.push(call)
      const a =
        typeof opts.answers === 'function'
          ? opts.answers(call, calls.length)
          : (opts.answers.shift() as Answer)
      if ('kind' in a) return err(a)
      return ok({
        text: a.text,
        stop: a.stop ?? ('end' as const),
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        model: 'test-model',
        cost: { micros: 0, unpriced: true },
        route,
        attempts: 1,
      })
    },
  }
  const done: number[] = []
  const svc = triageService({
    db,
    router: router as never,
    batchSize: opts.batchSize,
    now: () => new Date('2026-10-27T07:30:00Z'),
    onDone: (_u, n) => done.push(n),
  })
  let n = 0
  const add = async (
    o: Partial<typeof messages.$inferInsert> = {},
    folder = f1.id,
    account = acc.id,
  ) => {
    n++
    const [m] = await db
      .insert(messages)
      .values({
        userId: user.id,
        accountId: account,
        folderId: folder,
        providerMessageId: `m${n}`,
        fromAddress: `p${n}@acme.example`,
        fromName: `Person ${n}`,
        subject: `Subject ${n}`,
        bodyText: `Body ${n} please reply`,
        sentAt: new Date('2026-10-27T07:14:00Z'),
        receivedAt: new Date(1_700_000_000_000 + n * 1000),
        ...o,
      })
      .returning()
    return m!
  }
  return { db, user, repos, acc, acc2, f2, svc, add, calls, done }
}

type Setup = Awaited<ReturnType<typeof setup>>
const entry = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  category: 'workRequest',
  importance: 'medium',
  urgency: 'notUrgent',
  needsReply: true,
  summary: 'Needs the numbers.',
  reason: 'Direct request',
  actionItems: [{ text: 'Send Q3 numbers', dueDate: '2026-10-30', dueText: null }],
  confidence: 0.8,
  ...o,
})
const ans = (...entries: object[]): Answer => ({ text: JSON.stringify({ results: entries }) })
const ids = (s: Setup) => s.db.select().from(triageResults)

describe('triage service', () => {
  it('classifies a batch, stores results with provenance, resolves due dates, and computes priority', async () => {
    const s = await setup({
      answers: [ans(entry('e1', { importance: 'high', urgency: 'urgent' }), entry('e2'))],
    })
    const [a, b] = [await s.add(), await s.add()]
    const run = await s.svc.triageMessages(s.user.id, [a.id, b.id])
    expect(run).toEqual({ byAi: 2, byRule: 0, unclassified: 0 })
    const rows = await ids(s)
    const ra = rows.find((r) => r.messageId === a.id)!
    expect(ra).toMatchObject({
      category: 'work_request',
      importance: 'high',
      urgency: 'urgent',
      priority: 'p1_do_now',
      source: 'ai',
      model: 'test-model',
      promptVersion: 'triage.v1',
      needsReply: true,
    })
    expect(rows.find((r) => r.messageId === b.id)!.priority).toBe('p3_this_week')
    const acts = await s.db.select().from(actionItems)
    expect(acts).toHaveLength(2)
    expect(acts[0]!.dueAt).toEqual(new Date('2026-10-30T22:59:00Z')) // 23:59 Berlin (CET)
    expect(s.done).toEqual([2])
  })

  it('pre-filter labels never reach the router: muted, bulk, security and excluded accounts', async () => {
    const s = await setup({ answers: [] })
    await s.repos.rules.add('mute', '@muted.example')
    const muted = await s.add({ fromAddress: 'x@muted.example' })
    const bulk = await s.add({ listUnsubscribe: '<mailto:u@x>' })
    const sec = await s.add({ subject: 'Your verification code is 123456' })
    const ex = await s.add({}, s.f2.id, s.acc2.id)
    const run = await s.svc.triageMessages(s.user.id, [muted.id, bulk.id, sec.id, ex.id])
    expect(run).toEqual({ byAi: 0, byRule: 4, unclassified: 0 })
    expect(s.calls).toHaveLength(0)
    const rows = await ids(s)
    expect(rows.every((r) => r.source === 'rule')).toBe(true)
    expect(rows.find((r) => r.messageId === ex.id)!.reason).toBe(AI_EXCLUDED_REASON)
    expect(rows.find((r) => r.messageId === sec.id)!.category).toBe('security_account')
  })

  it('excluded-account mail text is never in any prompt', async () => {
    const s = await setup({ answers: () => ans(entry('e1')) })
    await s.add({ bodyText: 'TOP-SECRET-EXCLUDED' }, s.f2.id, s.acc2.id)
    const ok1 = await s.add()
    await s.svc.triagePending(s.user.id)
    expect(s.calls.every((c) => !c.user.includes('TOP-SECRET-EXCLUDED'))).toBe(true)
    expect((await ids(s)).some((r) => r.messageId === ok1.id)).toBe(true)
  })

  it('VIP importance has a floor of High; a user correction beats both the model and the VIP floor', async () => {
    const s = await setup({
      answers: [
        ans(
          entry('e1', { importance: 'low' }),
          entry('e2', { importance: 'high' }),
          entry('e3', { importance: 'low' }),
        ),
      ],
    })
    await s.repos.rules.add('vip', 'vip@acme.example')
    const vip = await s.add({ fromAddress: 'vip@acme.example' })
    const corrected = await s.add({ fromAddress: 'c@acme.example' })
    await s.repos.rules.setCorrection('c@acme.example', 'low')
    const plain = await s.add({ fromAddress: 'z@acme.example' })
    await s.svc.triageMessages(s.user.id, [vip.id, corrected.id, plain.id])
    const by = Object.fromEntries((await ids(s)).map((r) => [r.messageId, r.importance]))
    expect(by[vip.id]).toBe('high')
    expect(by[corrected.id]).toBe('low')
    expect(by[plain.id]).toBe('low')
  })

  it('drops invented and duplicate ids and retries missing ones alone once', async () => {
    const s = await setup({
      answers: [ans(entry('e1'), entry('e1', { summary: 'dup' }), entry('e9')), ans(entry('e1'))],
    })
    const [a, b] = [await s.add(), await s.add()]
    const run = await s.svc.triageMessages(s.user.id, [a.id, b.id])
    expect(run).toEqual({ byAi: 2, byRule: 0, unclassified: 0 })
    expect(s.calls).toHaveLength(2)
    expect(s.calls[1]!.user.match(/<email id=/g)).toHaveLength(1)
  })

  it('a message the model still cannot answer is stored as unclassified (medium; High for VIP)', async () => {
    const s = await setup({ answers: [ans(entry('e9')), ans(entry('e9'))] })
    const m = await s.add()
    const run = await s.svc.triageMessages(s.user.id, [m.id])
    expect(run).toEqual({ byAi: 0, byRule: 0, unclassified: 1 })
    expect((await ids(s))[0]).toMatchObject({
      reason: UNCLASSIFIED_REASON,
      importance: 'medium',
      source: 'rule',
    })
  })

  it('malformed or truncated output splits the batch', async () => {
    const answers = (c: Call) => {
      const n = c.user.match(/<email id=/g)!.length
      if (n > 1) return { text: '{"results": [', stop: 'length' as const }
      return ans(entry('e1'))
    }
    const s = await setup({ answers: (c) => answers(c) })
    const ms = [await s.add(), await s.add(), await s.add(), await s.add()]
    const run = await s.svc.triageMessages(
      s.user.id,
      ms.map((m) => m.id),
    )
    expect(run.byAi).toBe(4)
    expect(s.calls.some((c) => c.user.match(/<email id=/g)!.length === 1)).toBe(true)
  })

  it('a provider failure stops the run, keeps earlier results and leaves the rest queued', async () => {
    let n = 0
    const s = await setup({
      batchSize: 2,
      answers: () =>
        ++n === 1 ? ans(entry('e1'), entry('e2')) : { kind: 'cap_reached', scope: 'tokens' },
    })
    const ms = [await s.add(), await s.add(), await s.add(), await s.add()]
    const run = await s.svc.triageMessages(
      s.user.id,
      ms.map((m) => m.id),
    )
    expect(run).toMatchObject({ byAi: 2, failure: { kind: 'cap_reached' } })
    expect(await s.repos.triage.untriaged()).toHaveLength(2)
  })

  it('triagePending only handles untriaged mail, is idempotent, and respects useAi:false', async () => {
    const s = await setup({ answers: [ans(entry('e1'))] })
    await s.add({ listUnsubscribe: '<x>' })
    await s.add()
    const dry = await s.svc.triagePending(s.user.id, { useAi: false })
    expect(dry).toEqual({ byAi: 0, byRule: 1, unclassified: 0 })
    expect(s.calls).toHaveLength(0)
    expect(await s.svc.triagePending(s.user.id)).toMatchObject({ byAi: 1 })
    expect(await s.svc.triagePending(s.user.id)).toEqual({ byAi: 0, byRule: 0, unclassified: 0 })
    expect(s.calls).toHaveLength(1)
  })

  it('uses the repair route for the second attempt and applies privacy settings', async () => {
    const s = await setup({ answers: [{ text: 'not json' }, ans(entry('e1'))] })
    await s.repos.settings.setMany({ 'privacy.subjectOnly': true })
    const m = await s.add({ bodyText: 'private body text' })
    expect(await s.svc.triageMessages(s.user.id, [m.id])).toMatchObject({ byAi: 1 })
    expect(s.calls.map((c) => c.task)).toEqual(['triage', 'repair'])
    expect(s.calls[0]!.user).toContain('[body not shared]')
    expect(s.calls[0]!.user).not.toContain('private body text')
    expect(s.calls[1]!.user).toContain('<previous_output>')
  })

  it('stores only what the model returned within limits', async () => {
    const long = 'x'.repeat(500)
    const s = await setup({
      answers: [
        ans(
          entry('e1', {
            summary: long,
            reason: long,
            confidence: 7,
            actionItems: [
              { text: '  ', dueDate: null, dueText: null },
              { text: long, dueDate: 'not-a-date', dueText: 'soon' },
            ],
          }),
        ),
      ],
    })
    const m = await s.add()
    await s.svc.triageMessages(s.user.id, [m.id])
    const r = (await ids(s))[0]!
    expect([r.summary.length, r.reason.length, r.confidence]).toEqual([220, 100, 1])
    const acts = await s.db.select().from(actionItems)
    expect(acts).toHaveLength(1)
    expect(acts[0]).toMatchObject({ dueAt: null, dueText: 'soon' })
    expect(acts[0]!.itemText.length).toBe(200)
  })

  it('never touches another user’s messages', async () => {
    const s = await setup({ answers: [ans(entry('e1'))] })
    const m = await s.add()
    const other = await authRepo(s.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    expect(await s.svc.triageMessages(other.id, [m.id])).toEqual({
      byAi: 0,
      byRule: 0,
      unclassified: 0,
    })
    expect(s.calls).toHaveLength(0)
  })
})
