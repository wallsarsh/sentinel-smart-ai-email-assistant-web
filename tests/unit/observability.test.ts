import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { jobQueue } from '../../server/jobs/queue'
import { collectGauges, readiness } from '../../server/observability/collect'
import { errorReporter, scrubError } from '../../server/observability/errors'
import {
  createMetrics,
  httpRequests,
  jobOldestQueuedSeconds,
  jobQueueDepth,
  metrics,
  recordRequest,
  ROUTE_WORDS,
  routeLabel,
} from '../../server/observability/metrics'

const UUID = '3f2b8c1e-5d7a-4c11-9e6f-0a1b2c3d4e5f'

describe('prometheus rendering', () => {
  it('renders counters, gauges and histograms in the text format, with escaped label values', () => {
    const m = createMetrics()
    m.counter('x_total', 'A counter').inc({ route: '/api/a', note: 'say "hi"\n' }, 2)
    m.gauge('y', 'A gauge').set({}, 7)
    const h = m.histogram('z_seconds', 'A histogram')
    h.observe({ route: '/r' }, 0.03)
    h.observe({ route: '/r' }, 3)
    const text = m.render()
    expect(text).toContain('# TYPE x_total counter')
    expect(text).toContain('x_total{note="say \\"hi\\"\\n",route="/api/a"} 2')
    expect(text).toContain('y 7')
    expect(text).toContain('z_seconds_bucket{route="/r",le="0.025"} 0')
    expect(text).toContain('z_seconds_bucket{route="/r",le="0.05"} 1')
    expect(text).toContain('z_seconds_bucket{route="/r",le="2.5"} 1')
    expect(text).toContain('z_seconds_bucket{route="/r",le="5"} 2')
    expect(text).toContain('z_seconds_bucket{route="/r",le="+Inf"} 2')
    expect(text).toContain('z_seconds_count{route="/r"} 2')
    expect(text.endsWith('\n')).toBe(true)
  })
})

describe('route labels', () => {
  it('the allow-list covers every fixed word in server/api', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
      )
    const words = new Set<string>()
    for (const f of walk('server/api'))
      for (const seg of f
        .replace('server/api/', '')
        .replace(/\.(get|post|put|patch|delete)\.ts$|\.ts$/, '')
        .split('/'))
        if (!seg.startsWith('[') && seg !== 'index') words.add(seg)
    expect([...words].filter((w) => !ROUTE_WORDS.has(w))).toEqual([])
  })

  it.each([
    ['/api/inbox', '/api/inbox'],
    ['/api/inbox/counts', '/api/inbox/counts'],
    [`/api/messages/${UUID}`, '/api/messages/:id'],
    [`/api/messages/${UUID}/triage`, '/api/messages/:id/triage'],
    ['/api/auth/mfa/login', '/api/auth/mfa/login'],
    ['/api/accounts/google/callback', '/api/accounts/google/callback'],
    [`/api/auth/sessions/0123456789abcdef`, '/api/auth/sessions/:id'],
    ['/api/search?q=alice@example.test', '/api/search'],
    ['/api/not-a-route/xyz', '/api/other'],
    ['/inbox/abc', 'page'],
    ['/_nuxt/abc.js', 'asset'],
  ])('%s -> %s', (path, label) => expect(routeLabel(path)).toBe(label))

  it('is bounded: thousands of hostile paths produce few labels, none carrying ids, addresses or tokens', () => {
    const labels = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      for (const p of [
        `/api/messages/${crypto.randomUUID()}`,
        `/api/messages/${crypto.randomUUID()}/${crypto.randomUUID()}`,
        `/api/${crypto.randomUUID()}`,
        `/api/search/${i}@x.test`,
        `/api/inbox/${'a'.repeat(i % 90)}`,
        `/api/auth/sessions/${i.toString(16).padStart(16, '0')}`,
        `/something/${i}`,
      ])
        labels.add(routeLabel(p))
    }
    expect(labels.size).toBeLessThan(12)
    expect([...labels].sort()).toEqual([
      '/api/auth/sessions/:id',
      '/api/inbox',
      '/api/inbox/:id',
      '/api/messages/:id',
      '/api/other',
      '/api/search/:id',
      'page',
    ])
    for (const l of labels) expect(l).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|@|[0-9]{3,}|a{20}/)
  })

  it('series are capped: past the limit new label sets fold into one overflow series', () => {
    const m = createMetrics()
    const c = m.counter('c_total', 'c')
    for (let i = 0; i < 1000; i++) c.inc({ k: String(i) })
    const lines = m
      .render()
      .split('\n')
      .filter((l) => l.startsWith('c_total'))
    expect(lines.length).toBeLessThanOrEqual(301)
    expect(lines.some((l) => l.startsWith('c_total{overflow="true"}'))).toBe(true)
  })

  it('requests are recorded by method, route pattern and status class only', () => {
    httpRequests.clear()
    recordRequest('GET', `/api/messages/${UUID}`, 200, 0.01)
    recordRequest('PURGE', '/api/inbox', 503, 0.01)
    const text = metrics.render()
    expect(text).toContain(
      'sentinel_http_requests_total{method="GET",route="/api/messages/:id",status="2xx"} 1',
    )
    expect(text).toContain('method="OTHER",route="/api/inbox",status="5xx"')
    expect(text).not.toContain(UUID)
  })
})

describe('gauges and readiness', () => {
  it('queue gauges fold unknown job names into "other" and report the oldest queued age', async () => {
    await collectGauges({
      stats: async () => ({
        byStatus: [
          { name: 'mail.check', status: 'queued', n: 3 },
          { name: 'mail.check', status: 'failed', n: 1 },
          { name: 'user-supplied-name-1', status: 'queued', n: 2 },
          { name: 'user-supplied-name-2', status: 'queued', n: 5 },
          { name: 'retention.run', status: 'weird', n: 1 },
        ],
        oldestQueued: [
          { name: 'mail.check', seconds: 42.4 },
          { name: 'user-supplied-name-1', seconds: 9 },
          { name: 'user-supplied-name-2', seconds: 90 },
        ],
      }),
    })
    const text = metrics.render()
    expect(text).toContain('sentinel_job_queue_jobs{name="mail.check",status="queued"} 3')
    expect(text).toContain('sentinel_job_queue_jobs{name="other",status="queued"} 7')
    expect(text).toContain('sentinel_job_queue_jobs{name="retention.run",status="other"} 1')
    expect(text).toContain('sentinel_job_oldest_queued_seconds{name="mail.check"} 42')
    expect(text).toContain('sentinel_job_oldest_queued_seconds{name="other"} 90')
    expect(text).not.toContain('user-supplied')
    jobQueueDepth.clear()
    jobOldestQueuedSeconds.clear()
  })

  it('the real queue reports counts per status and the oldest queued job', async () => {
    const { db } = await createTestDb()
    let t = new Date('2026-10-28T10:00:00Z')
    const q = jobQueue(db, () => t)
    await q.enqueue('mail.check', { key: 'a' })
    await q.enqueue('mail.check', { key: 'b' })
    t = new Date('2026-10-28T10:05:00Z')
    const s = await q.stats()
    expect(s.byStatus).toEqual([{ name: 'mail.check', status: 'queued', n: 2 }])
    expect(s.oldestQueued[0]!.seconds).toBeCloseTo(300, 0)
  })

  it('readiness is true on a migrated database and false when the database fails', async () => {
    const { db } = await createTestDb()
    expect(await readiness(db)).toEqual({
      ready: true,
      checks: { database: true, migrations: true },
    })
    const broken = {
      execute: async () => {
        throw new Error('down')
      },
    }
    expect(await readiness(broken as never)).toEqual({
      ready: false,
      checks: { database: false, migrations: false },
    })
  })
})

describe('error scrubbing', () => {
  const secrets = [
    'alice@example.test',
    'sk-abcdefghijklmnopqrstuvwxyz',
    'Bearer abc.def.ghi-jkl',
    'hunter2hunter2',
    '/home/deploy/secret-project',
    'token=topsecretvalue',
  ]

  it('removes addresses, keys, tokens, home paths and query strings from message and frames', () => {
    const e = new Error(
      `failed for alice@example.test with sk-abcdefghijklmnopqrstuvwxyz and Bearer abc.def.ghi-jkl password=hunter2hunter2 ${'Zm9vYmFy'.repeat(12)}`,
    )
    e.name = 'ProviderError'
    e.stack = [
      'ProviderError: x',
      '    at send (/home/deploy/secret-project/server/mail/send/gmail.ts:41:9)',
      '    at fetchIt (file:///home/deploy/secret-project/node_modules/undici/lib/fetch.js:10:2)',
      '    at handler (/srv/app/server/api/search.get.ts:12:3?token=topsecretvalue)',
      '    at async /root/other/place.js:1:1',
    ].join('\n')
    const r = scrubError(e, {
      route: '/api/search',
      build: '1.0.0',
      now: new Date('2026-10-28T10:00:00Z'),
    })
    const json = JSON.stringify(r)
    for (const s of secrets) expect(json, s).not.toContain(s)
    expect(json).not.toContain('Zm9vYmFy')
    expect(r.frames[0]).toBe('send (server/mail/send/gmail.ts:41:9)')
    expect(r.frames.some((f) => f.includes('node_modules/undici/lib/fetch.js:10:2'))).toBe(true)
    expect(r).toMatchObject({
      name: 'ProviderError',
      route: '/api/search',
      build: '1.0.0',
      at: '2026-10-28T10:00:00.000Z',
    })
    expect(r.message.length).toBeLessThanOrEqual(300)
    expect(Object.keys(r).sort()).toEqual(['at', 'build', 'frames', 'message', 'name', 'route']) // nothing else leaves
  })

  it('handles thrown strings and missing stacks', () => {
    const r = scrubError('plain string for bob@example.test', {
      route: 'page',
      build: 'b',
      now: new Date(),
    })
    expect(r.message).toBe('plain string for [email]')
    expect(r.frames).toEqual([])
  })
})

describe('error reporter opt-in', () => {
  const mk = (o: { url?: string; opted?: boolean; fail?: boolean } = {}) => {
    const sent: string[] = []
    let t = new Date('2026-10-28T10:00:00Z')
    const r = errorReporter({
      url: 'url' in o ? o.url : 'https://reports.example/in',
      build: 'b',
      now: () => t,
      post: async (_u, body) => {
        if (o.fail) throw new Error('down')
        sent.push(body)
      },
      userOptedIn: async () => o.opted ?? false,
    })
    return { r, sent, advance: (ms: number) => (t = new Date(t.getTime() + ms)) }
  }

  it('is off without a URL', async () => {
    const { r, sent } = mk({ url: undefined })
    expect(await r.report(new Error('x'), { route: 'page' })).toBe(false)
    expect(sent).toEqual([])
  })

  it("errors during a signed-in user's request are sent only if that user opted in", async () => {
    const no = mk({ opted: false })
    expect(await no.r.report(new Error('x'), { route: 'page', userId: 'u1' })).toBe(false)
    expect(no.sent).toEqual([])
    const yes = mk({ opted: true })
    expect(await yes.r.report(new Error('x'), { route: 'page', userId: 'u1' })).toBe(true)
    expect(yes.sent).toHaveLength(1)
    expect(yes.sent[0]).not.toContain('u1')
  })

  it("system errors with no user follow the operator's URL", async () => {
    const { r, sent } = mk()
    expect(await r.report(new Error('boom'), { route: '/api/other' })).toBe(true)
    expect(sent).toHaveLength(1)
  })

  it('the same error is sent at most once a minute, and a failing endpoint never throws', async () => {
    const { r, sent, advance } = mk()
    const same = new Error('same')
    expect(await r.report(same, { route: 'page' })).toBe(true)
    expect(await r.report(same, { route: 'page' })).toBe(false)
    advance(61_000)
    expect(await r.report(same, { route: 'page' })).toBe(true)
    expect(sent).toHaveLength(2)
    const bad = mk({ fail: true })
    expect(await bad.r.report(new Error('x'), { route: 'page' })).toBe(false)
  })
})
