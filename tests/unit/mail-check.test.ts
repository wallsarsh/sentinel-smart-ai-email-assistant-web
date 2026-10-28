import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages } from '../../server/db/schema'
import { Deadline, DeadlineExceeded } from '../../server/jobs/deadline'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { triageService } from '../../server/triage/service'
import { err, ok } from '../../shared/errors/result'
import { defaultPorts, mailCheck, type MailCheckPorts } from '../../worker/jobs/mail-check'
import { sampleMessage } from '../contract/mail-provider-contract'
import { FakeMailProvider } from '../helpers/fake-mail-provider'

const ctx = (
  userId: string | null,
  deadline = new Deadline(60_000),
  payload: Record<string, unknown> = {},
) => ({ job: {} as never, userId, deadline, payload })

function ports(over: Partial<MailCheckPorts> = {}) {
  const log: string[] = []
  const runs: { id: string; v: object }[] = []
  const p: MailCheckPorts = {
    sync: async () => (log.push('sync'), { newMessages: 3, errors: {} }),
    triageRules: async () => (log.push('rules'), { processed: 2 }),
    triageAi: async () => (log.push('ai'), { processed: 0 }),
    notifyNewMail: async () => void log.push('notify'),
    notifyAccountIssues: async (_u, ids) => void log.push(`issues:${ids.join(',')}`),
    aiEnabled: async () => false,
    accountsNeedingReauth: async () => [],
    startRun: async (_u, t) => (log.push(`start:${t}`), 'run-1'),
    finishRun: async (_u, id, v) => void runs.push({ id, v }),
    ...over,
  }
  return { p, log, runs }
}

describe('mail-check job', () => {
  it('runs sync → rules → notify, skips AI when background AI is off, and records the run', async () => {
    const { p, log, runs } = ports()
    await mailCheck(p)(ctx('u1', undefined, { trigger: 'manual' }))
    expect(log).toEqual(['start:manual', 'sync', 'rules', 'notify'])
    expect(runs).toEqual([
      { id: 'run-1', v: { outcome: 'ok', newMessages: 3, triaged: 2, errorCode: null } },
    ])
  })

  it('with background AI on, triages in chunks until the queue is empty and notifies after each step', async () => {
    let left = 40
    const { p, log, runs } = ports({
      aiEnabled: async () => true,
      triageAi: async (_u, limit) => {
        const n = Math.min(left, limit)
        left -= n
        log.push(`ai:${limit}`)
        return { processed: n }
      },
    })
    await mailCheck(p, { triageChunk: 16 })(ctx('u1'))
    expect(log.filter((l) => l.startsWith('ai:'))).toEqual(['ai:16', 'ai:16', 'ai:16', 'ai:16'])
    expect((runs[0]!.v as { triaged: number }).triaged).toBe(2 + 40)
    expect(log.filter((l) => l === 'notify').length).toBeGreaterThanOrEqual(4)
  })

  it('a cap, consent or network failure in AI stops the step and the run is partial; the rest stays queued', async () => {
    const { p, runs, log } = ports({
      aiEnabled: async () => true,
      triageAi: async () => ({ processed: 3, failure: { kind: 'cap_reached', scope: 'tokens' } }),
    })
    await mailCheck(p)(ctx('u1'))
    expect(runs[0]!.v).toMatchObject({ outcome: 'partial', errorCode: 'cap_reached', triaged: 5 })
    expect(log.filter((l) => l === 'ai').length).toBe(0)
  })

  it('does not start model calls without enough time left', async () => {
    let t = 0
    const deadline = new Deadline(10_000, () => t)
    const { p, log } = ports({
      aiEnabled: async () => true,
      triageAi: async () => {
        t += 5000
        log.push('ai')
        return { processed: 5 }
      },
    })
    await mailCheck(p, { minAiMs: 6000, triageChunk: 5 })(ctx('u1', deadline))
    expect(log.filter((l) => l === 'ai')).toHaveLength(1) // 5 s left after the first step, less than the 6 s a request needs
  })

  it('an expired deadline stops cleanly with a timeout record and rethrows for the queue', async () => {
    const d = new Deadline(1000)
    d.cancel()
    const { p, runs } = ports()
    await expect(mailCheck(p)(ctx('u1', d))).rejects.toBeInstanceOf(DeadlineExceeded)
    expect(runs[0]!.v).toMatchObject({ outcome: 'timeout', errorCode: 'deadline' })
    const mid = new Deadline(60_000)
    const r = ports({
      triageRules: async () => {
        mid.cancel()
        return { processed: 0 }
      },
      notifyNewMail: async () => mid.check(),
    })
    await expect(mailCheck(r.p)(ctx('u1', mid))).rejects.toBeInstanceOf(DeadlineExceeded)
    expect(r.runs[0]!.v).toMatchObject({ outcome: 'timeout' })
  })

  it('reports accounts that need reconnecting, and a failed sync everywhere is retried with backoff', async () => {
    const a = ports({ accountsNeedingReauth: async () => ['acc1', 'acc2'] })
    await mailCheck(a.p)(ctx('u1'))
    expect(a.log).toContain('issues:acc1,acc2')
    const b = ports({ sync: async () => ({ newMessages: 0, errors: { x: { kind: 'network' } } }) })
    await expect(mailCheck(b.p)(ctx('u1'))).rejects.toThrow('mail_check_failed_retryable')
    expect(b.runs[0]!.v).toMatchObject({ outcome: 'error', errorCode: 'network' })
    const c = ports({ sync: async () => ({ newMessages: 2, errors: { x: { kind: 'network' } } }) })
    await mailCheck(c.p)(ctx('u1')) // some progress: partial, no retry
    expect(c.runs[0]!.v).toMatchObject({ outcome: 'partial' })
  })

  it('unexpected errors are recorded and rethrown; jobs without a user do nothing', async () => {
    const { p, runs } = ports({
      triageRules: async () => {
        throw new TypeError('boom')
      },
    })
    await expect(mailCheck(p)(ctx('u1'))).rejects.toThrow('boom')
    expect(runs[0]!.v).toMatchObject({ outcome: 'error', errorCode: 'TypeError' })
    const none = ports()
    await mailCheck(none.p)(ctx(null))
    expect(none.log).toEqual([])
  })
})

describe('mail-check with real services (idempotent on repeat)', () => {
  async function setup() {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const repos = forUser(db, user.id)
    const acc = await repos.accounts.create({
      type: 'imap',
      email: 'me@x.test',
      displayName: '',
      color: 1,
    })
    await repos.mail.upsertFolders(acc.id, [
      { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
    ])
    const provider = new FakeMailProvider()
    provider.messages.set('1', sampleMessage('1', 't', { listUnsubscribe: '<mailto:u@x>' }))
    provider.messages.set(
      '2',
      sampleMessage('2', 't2', { from: { address: 'noreply@shop.example' } }),
    )
    const aiCalls: number[] = []
    const router = {
      complete: async () => {
        aiCalls.push(1)
        return err({ kind: 'cap_reached' as const, scope: 'tokens' as const })
      },
    }
    const triage = triageService({ db, router: router as never })
    const handler = mailCheck(defaultPorts({ db, providerFor: async () => provider, triage }))
    return { db, user, repos, provider, handler, aiCalls }
  }

  it('a repeat run finds nothing new, labels nothing twice, and keeps one record per run', async () => {
    const s = await setup()
    await s.handler(ctx(s.user.id))
    const after1 = await s.db.select().from(messages)
    expect(after1).toHaveLength(2)
    const runs1 = await s.repos.background.recentRuns()
    expect(runs1[0]).toMatchObject({
      outcome: 'ok',
      newMessages: 2,
      triaged: 2,
      trigger: 'periodic',
    })
    await s.handler(ctx(s.user.id))
    expect(await s.db.select().from(messages)).toHaveLength(2)
    const runs2 = await s.repos.background.recentRuns()
    expect(runs2).toHaveLength(2)
    expect(runs2[0]).toMatchObject({ outcome: 'ok', newMessages: 0, triaged: 0 })
    expect(ok(1).ok).toBe(true)
  })

  it('background AI off means no model call; on, a cap leaves the run partial', async () => {
    const s = await setup()
    s.provider.messages.set('3', sampleMessage('3', 't3')) // an ordinary mail that needs the model
    await s.handler(ctx(s.user.id))
    expect(s.aiCalls).toHaveLength(0)
    await s.repos.settings.setMany({ 'bg.aiEnabled': true })
    await s.handler(ctx(s.user.id))
    expect(s.aiCalls.length).toBeGreaterThan(0)
    expect((await s.repos.background.recentRuns())[0]).toMatchObject({
      outcome: 'partial',
      errorCode: 'cap_reached',
    })
  })
})
