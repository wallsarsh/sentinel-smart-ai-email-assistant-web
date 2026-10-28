// Performance budgets on real Postgres with 50 000 messages, through the built server. Numbers are
// printed and written to tests/perf/last-run.json so they can be copied into the task log.
import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { triageService } from '../../server/triage/service'
import { signUp, startStack, type Stack } from '../e2e/harness'
import { BUDGETS } from './budgets'

let s: Stack
let cookie = ''
let userId = ''
const results: Record<string, number | string> = {}

beforeAll(async () => {
  s = await startStack()
  const { ctx, page } = await signUp(s, 'perf@e2e.test')
  await page.click('[data-testid=skip]')
  await page.waitForURL(`${s.url}/`)
  cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  await ctx.close()
  userId = (await authRepo(s.db).userByEmail('perf@e2e.test'))!.id
  const repos = forUser(s.db, userId)
  const acc = await repos.accounts.create({ type: 'imap', email: 'me@e2e.test', displayName: '' })
  await repos.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const [folder] = await repos.mail.listFolders(acc.id)
  const n = BUDGETS.messages
  const t0 = Date.now()
  await s.db.execute(sql`
    insert into messages (user_id, account_id, folder_id, provider_message_id, from_address, from_name,
                          subject, snippet, body_text, sent_at, received_at, is_read)
    select ${userId}, ${acc.id}, ${folder!.id}, 'p' || g, 'sender' || (g % 500) || '@example.test', 'Sender ' || (g % 500),
           'Subject number ' || g || case when g % 97 = 0 then ' quarterly report' else '' end,
           'Snippet of message ' || g,
           'Body text for message ' || g || ' ' || repeat('lorem ipsum dolor sit amet ', 20) ||
             case when g % 97 = 0 then 'quarterly report figures' else '' end,
           now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, g % 3 = 0
    from generate_series(1, ${n}) g`)
  await s.db.execute(sql`
    insert into triage_results (message_id, user_id, category, importance, urgency, priority, needs_reply, summary, reason, source)
    select m.id, m.user_id, 'work_request', ((array['high','medium','low'])[1 + (row_number() over () % 3)::int])::importance,
           'not_urgent', ((array['p1_do_now','p2_today','p3_this_week','p4_fyi'])[1 + (row_number() over () % 4)::int])::priority,
           (row_number() over () % 5 = 0), 'summary', 'reason', 'rule'
    from messages m where m.user_id = ${userId}`)
  await s.db.execute(sql`analyze messages`)
  await s.db.execute(sql`analyze triage_results`)
  results.seedSeconds = Math.round((Date.now() - t0) / 100) / 10
}, 300_000)

afterAll(async () => {
  writeFileSync('tests/perf/last-run.json', JSON.stringify(results, null, 2) + '\n')
  console.log('perf results', JSON.stringify(results))
  await s?.stop()
})

// The server allows 300 API requests a minute per user; the suite spaces itself under that.
const sent: number[] = []
async function allow(n: number) {
  for (;;) {
    const now = Date.now()
    while (sent.length && now - sent[0]! > 60_500) sent.shift()
    if (sent.length + n <= 240) break
    await new Promise((r) => setTimeout(r, sent[0]! + 60_500 - now))
  }
  for (let i = 0; i < n; i++) sent.push(Date.now())
}

async function p95(path: string, runs = 60) {
  const times: number[] = []
  await allow(runs + 5)
  for (let i = 0; i < runs + 5; i++) {
    const t = performance.now()
    const r = await fetch(`${s.url}${path}`, { headers: { cookie } })
    await r.arrayBuffer()
    if (!r.ok) throw new Error(`${path} -> ${r.status}`)
    if (i >= 5) times.push(performance.now() - t) // the first few warm the connection and plan caches
  }
  times.sort((a, b) => a - b)
  return Math.round(times[Math.ceil(times.length * 0.95) - 1]! * 10) / 10
}

describe('API latency, 50 000 messages', () => {
  it('inbox first page', async () => {
    const v = (results.inboxFirstPage = await p95('/api/inbox?segment=all&limit=30'))
    expect(v).toBeLessThan(BUDGETS.api.inboxFirstPage)
  })

  it('inbox deep page by cursor', async () => {
    let cursor = ''
    await allow(30)
    for (let i = 0; i < 30; i++) {
      const r = (await (
        await fetch(`${s.url}/api/inbox?limit=100${cursor}`, { headers: { cookie } })
      ).json()) as {
        nextCursor: string | null
      }
      cursor = `&cursor=${encodeURIComponent(r.nextCursor!)}`
    }
    const v = (results.inboxNextPage = await p95(`/api/inbox?limit=30${cursor}`))
    expect(v).toBeLessThan(BUDGETS.api.inboxNextPage)
  })

  it('inbox segments and counts', async () => {
    expect((results.inboxCounts = await p95('/api/inbox/counts'))).toBeLessThan(
      BUDGETS.api.inboxCounts,
    )
    results.inboxNeedsReply = await p95('/api/inbox?segment=needs_reply&limit=30')
    expect(results.inboxNeedsReply as number).toBeLessThan(BUDGETS.api.inboxFirstPage)
  })

  it('full-text search', async () => {
    const hits = (await (
      await fetch(`${s.url}/api/search?q=quarterly+report`, { headers: { cookie } })
    ).json()) as unknown
    expect(JSON.stringify(hits)).toContain('quarterly')
    expect((results.search = await p95('/api/search?q=quarterly+report'))).toBeLessThan(
      BUDGETS.api.search,
    )
  })

  it('actions and brief', async () => {
    expect((results.actions = await p95('/api/actions'))).toBeLessThan(BUDGETS.api.actions)
    expect((results.brief = await p95('/api/brief'))).toBeLessThan(BUDGETS.api.brief)
  })
})

describe('triage throughput', () => {
  it('rule-based triage of new mail keeps up (no AI call)', async () => {
    const repos = forUser(s.db, userId)
    const acc = (await repos.accounts.list())[0]!
    const [folder] = await repos.mail.listFolders(acc.id)
    const N = 1000
    await s.db.execute(sql`
      insert into messages (user_id, account_id, folder_id, provider_message_id, from_address, from_name,
                            subject, body_text, sent_at, received_at, list_unsubscribe)
      select ${userId}, ${acc.id}, ${folder!.id}, 'new' || g, 'noreply' || g || '@shop.example', 'Shop',
             'Offer ' || g, 'Buy now', now(), now(), '<mailto:u@shop.example>'
      from generate_series(1, ${N}) g`)
    const svc = triageService({
      db: s.db,
      router: {
        complete: async () => {
          throw new Error('no AI in this test')
        },
      } as never,
    })
    const t = performance.now()
    let done = 0
    while (done < N) {
      const r = await svc.triagePending(userId, { useAi: false, limit: 200 })
      if (!r.byRule) break
      done += r.byRule
    }
    const perSecond = Math.round((done / ((performance.now() - t) / 1000)) * 10) / 10
    results.triageRulesPerSecond = perSecond
    expect(done).toBe(N)
    expect(perSecond).toBeGreaterThan(BUDGETS.triageRulesPerSecond)
  }, 120_000)
})

describe('browser load, real pages', () => {
  it('first contentful paint and DOMContentLoaded stay inside budget', async () => {
    const ctx = await s.browser.newContext({ extraHTTPHeaders: { cookie } })
    for (const path of ['/inbox', '/']) {
      const page = await ctx.newPage()
      await page.goto(`${s.url}${path}`)
      await page.waitForLoadState('networkidle')
      const m = await page.evaluate(() => ({
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1,
        dcl: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
          .domContentLoadedEventEnd,
      }))
      results[`fcp ${path}`] = Math.round(m.fcp)
      results[`dcl ${path}`] = Math.round(m.dcl)
      expect(m.fcp).toBeGreaterThan(0)
      expect(m.fcp).toBeLessThan(BUDGETS.browser.firstContentfulPaint)
      expect(m.dcl).toBeLessThan(BUDGETS.browser.domContentLoaded)
      await page.close()
    }
    await ctx.close()
  })
})
