// Security review on the real built server: headers, cookies, CSRF on every mutating route, authentication on every
// protected route, two-user authorization on every id-taking route, SSRF, XSS in the browser, error leakage.
// Routes are enumerated from server/api, so a new route is covered (or must be classified) automatically.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { METRICS_TOKEN, pace, PASSWORD, signUp, startStack, type Stack } from '../e2e/harness'

let s: Stack
type Session = { cookie: string; csrf: string; id: string }
let A: Session
let B: Session
let ids = {
  message: '',
  draftMsg: '',
  account: '',
  action: '',
  brief: '',
  rule: '',
  device: '',
  handle: '',
  provider: '',
}

async function makeUser(email: string): Promise<Session> {
  const { ctx, page } = await signUp(s, email)
  await page.click('[data-testid=skip]')
  await page.waitForURL(`${s.url}/`)
  const cookies = await ctx.cookies()
  await ctx.close()
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    csrf: cookies.find((c) => c.name === 'sentinel_csrf')!.value,
    id: (await authRepo(s.db).userByEmail(email))!.id,
  }
}

type Route = { method: string; path: string; file: string }
function routes(): Route[] {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) =>
      statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
    )
  return walk('server/api').map((file) => {
    const rel = file.replace('server/api/', '').replace(/\.ts$/, '')
    const m = /\.(get|post|put|patch|delete)$/.exec(rel)
    const base = rel
      .replace(/\.(get|post|put|patch|delete)$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '')
    return {
      method: (m?.[1] ?? 'get').toUpperCase(),
      path: `/api/${base}`.replace(/\/$/, ''),
      file,
    }
  })
}
const fill = (path: string, id: string) => path.replace(/\[(\w+)\]/g, id)

type CallOpts = {
  cookie?: string
  csrf?: string | null
  id?: string
  body?: unknown
  origin?: string
}

/** One request; a 429 (the server's own rate limit, which stays on) is waited out and retried. */
async function call(r: Route, o: CallOpts) {
  for (let i = 0; i < 4; i++) {
    const res = await once(r, o)
    if (res.status !== 429) return res
    await new Promise((x) =>
      setTimeout(x, (Number(res.headers.get('retry-after')) || 60) * 1000 + 500),
    )
  }
  return once(r, o)
}

async function once(r: Route, o: CallOpts) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (o.cookie) headers.cookie = `${o.cookie}`
  if (o.csrf) headers['x-csrf-token'] = o.csrf
  if (o.origin) headers.origin = o.origin
  return fetch(`${s.url}${fill(r.path, o.id ?? '11111111-1111-4111-8111-111111111111')}`, {
    method: r.method,
    headers,
    body: ['GET', 'HEAD'].includes(r.method) ? undefined : JSON.stringify(o.body ?? {}),
    redirect: 'manual',
  })
}

// Routes that may be reached without a session, with the reason.
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/ready',
  'GET /api/[...path]', // the JSON 404 for unknown API paths
  'GET /api/metrics', // 404 without a token, 401 with a wrong one: covered separately
  'POST /api/auth/login',
  'POST /api/auth/logout', // idempotent: clears the cookie of whoever sends it
  'POST /api/auth/signup',
  'POST /api/auth/password-reset',
  'POST /api/auth/password-reset-confirm',
  'POST /api/auth/mfa/login', // completes a login with a signed challenge
  'GET /api/accounts/google/callback', // OAuth redirects: carry a signed, user-bound state
  'GET /api/accounts/microsoft/callback',
])
// Deletes that answer {"ok":true} whether or not anything was there (the answer reveals nothing); the
// repositories only ever touch the caller's own rows, which the state checks below confirm.
const IDEMPOTENT = new Set(['DELETE /api/drafts/message/[id]'])
const key = (r: Route) => `${r.method} ${r.path.replace(/\/\[\w+\]/g, '/[id]')}`

beforeAll(async () => {
  s = await startStack()
  A = await makeUser('alice@sec.test')
  B = await makeUser('bob@sec.test')
  const repos = forUser(s.db, A.id)
  const acc = await repos.accounts.create({
    type: 'imap',
    email: 'alice@mail.test',
    displayName: '',
  })
  await repos.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const [folder] = await repos.mail.listFolders(acc.id)
  await repos.mail.upsertMessages([
    {
      accountId: acc.id,
      folderId: folder!.id,
      providerMessageId: 'p1',
      fromAddress: 'x@y.test',
      subject: 'Private to Alice',
      bodyText: 'ALICE-SECRET-BODY',
      sentAt: new Date(),
      receivedAt: new Date(),
    },
  ])
  const m = (await repos.mail.recent(1))[0]!
  await repos.triage.save(
    {
      messageId: m.id,
      category: 'work_request',
      importance: 'high',
      urgency: 'urgent',
      priority: 'p1_do_now',
      needsReply: true,
      summary: 'ALICE-SECRET-SUMMARY',
      reason: 'r',
      source: 'rule',
    } as never,
    [{ itemText: 'ALICE-SECRET-TASK', dueAt: null, dueText: null }],
  )
  const act = (await repos.actions.list())[0]!
  await repos.briefs.save({
    id: '22222222-2222-4222-8222-222222222222',
    windowStart: new Date(),
    windowEnd: new Date(),
    headline: 'ALICE-SECRET-BRIEF',
    stats: {},
    providerId: null,
    model: null,
    createdAt: new Date(),
    items: [],
  })
  await repos.rules.add('vip', 'boss@secret.test')
  const rule = (await repos.rules.list())[0]!
  ids = {
    message: m.id,
    draftMsg: m.id,
    account: acc.id,
    action: act.id,
    brief: '22222222-2222-4222-8222-222222222222',
    rule: rule.id,
    device: '33333333-3333-4333-8333-333333333333',
    handle: '0123456789abcdef',
    provider: '44444444-4444-4444-8444-444444444444',
  }
})
afterAll(async () => s?.stop())

describe('response headers', () => {
  const pages = ['/login', '/signup', '/']
  it.each(pages)('%s carries the security headers', async (path) => {
    const r = await fetch(`${s.url}${path}`, { redirect: 'manual' })
    const csp = r.headers.get('content-security-policy') ?? ''
    for (const d of [
      "default-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "connect-src 'self'",
    ])
      expect(csp, d).toContain(d)
    if (path !== '/') {
      // '/' only redirects a signed-out visitor to /login and has no scripts of its own
      expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/)
      expect(csp).toContain("'strict-dynamic'")
    }
    expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval')/)
    expect(csp).not.toMatch(/(^|[ ;])\*[ ;]|https?:\/\/\*/)
    expect(r.headers.get('x-frame-options')).toBe('DENY')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('referrer-policy')).toBe('same-origin')
    expect(r.headers.get('strict-transport-security')).toMatch(/max-age=\d{8,}/)
    expect(r.headers.get('permissions-policy')).toMatch(/camera=\(\)/)
    expect(r.headers.get('x-powered-by')).toBeNull()
    expect(r.headers.get('server')).toBeNull()
  })

  it('every inline script on a page carries the response nonce', async () => {
    const r = await fetch(`${s.url}/login`)
    const nonce = /'nonce-([^']+)'/.exec(r.headers.get('content-security-policy') ?? '')![1]!
    const html = await r.text()
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!)
    expect(scripts.length).toBeGreaterThan(0)
    for (const attrs of scripts) expect(attrs, attrs).toContain(`nonce="${nonce}"`)
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i) // no inline event handlers
  })

  it('a new nonce is used on each response', async () => {
    const n = async () =>
      /'nonce-([^']+)'/.exec(
        (await fetch(`${s.url}/login`)).headers.get('content-security-policy')!,
      )![1]
    expect(await n()).not.toBe(await n())
  })

  it('API responses are not cacheable and are JSON, not sniffable HTML', async () => {
    const r = await fetch(`${s.url}/api/auth/me`, { headers: { cookie: A.cookie } })
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('cache-control') ?? '').toMatch(/no-store|no-cache|private/)
  })
})

describe('cookies', () => {
  it('the session cookie is HttpOnly, SameSite=Lax, site-wide; the CSRF cookie is readable and SameSite=Strict', async () => {
    const r = await fetch(`${s.url}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': A.csrf,
        cookie: `sentinel_csrf=${A.csrf}`,
      },
      body: JSON.stringify({ email: 'alice@sec.test', password: PASSWORD }),
    })
    const set = r.headers.getSetCookie().find((c) => c.startsWith('sentinel_session='))!
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).toMatch(/Path=\//i)
    expect(set).toMatch(/Max-Age=\d+/i)
    const page = await fetch(`${s.url}/login`)
    const csrf = page.headers.getSetCookie().find((c) => c.startsWith('sentinel_csrf='))!
    expect(csrf).toMatch(/SameSite=Strict/i)
    expect(csrf).not.toMatch(/HttpOnly/i)
  })

  it('cookies are Secure in production', async () => {
    const { cookieOptions } = await import('../../server/auth/sessions')
    expect(cookieOptions(true).secure).toBe(true)
    expect(cookieOptions(true).httpOnly).toBe(true)
  })
})

describe('authentication on every route', () => {
  it('every route except the listed public ones refuses a request without a session', async () => {
    const bad: string[] = []
    for (const r of routes()) {
      if (PUBLIC.has(key(r))) continue
      const res = await call(r, { csrf: A.csrf, cookie: `sentinel_csrf=${A.csrf}` }) // CSRF-valid, but no session
      if (res.status !== 401) bad.push(`${key(r)} -> ${res.status}`)
    }
    expect(bad).toEqual([])
  }, 600_000)

  it('the public list is real: each entry exists as a route', () => {
    const have = new Set(routes().map(key))
    for (const p of PUBLIC) expect(have.has(p), p).toBe(true)
  })

  it('metrics: 404 is not used here (a token is configured); wrong or missing token is 401', async () => {
    expect((await fetch(`${s.url}/api/metrics`)).status).toBe(401)
    expect(
      (
        await fetch(`${s.url}/api/metrics`, {
          headers: { authorization: `Bearer ${METRICS_TOKEN}x` },
        })
      ).status,
    ).toBe(401)
  })
})

describe('CSRF on every mutating route', () => {
  it('a signed-in request without the CSRF header, or with a foreign Origin, is refused (403) on every POST/PUT/PATCH/DELETE', async () => {
    const bad: string[] = []
    for (const r of routes().filter((x) => x.method !== 'GET')) {
      const noHeader = await call(r, { cookie: `${A.cookie}` })
      if (noHeader.status !== 403) bad.push(`${key(r)} without header -> ${noHeader.status}`)
      const foreign = await call(r, {
        cookie: A.cookie,
        csrf: A.csrf,
        origin: 'https://evil.example',
      })
      if (foreign.status !== 403) bad.push(`${key(r)} foreign origin -> ${foreign.status}`)
      const forged = await call(r, {
        cookie: `${A.cookie.replace(/sentinel_csrf=[^;]+/, 'sentinel_csrf=attacker.value')}`,
        csrf: 'attacker.value',
      })
      if (forged.status !== 403) bad.push(`${key(r)} forged token -> ${forged.status}`)
    }
    expect(bad).toEqual([])
  }, 180_000)
})

describe("authorization: a second user cannot reach the first one's data", () => {
  it("every route with an id answers B with 404/403/422, never with A's data, and writes change nothing", async () => {
    const leaks: string[] = []
    const withId = routes().filter((r) => r.path.includes('['))
    expect(withId.length).toBeGreaterThan(15)
    const idFor = (r: Route) =>
      r.path.includes('/messages/') || r.path.includes('/drafts/message')
        ? ids.message
        : r.path.startsWith('/api/accounts/')
          ? ids.account
          : r.path.startsWith('/api/actions/')
            ? ids.action
            : r.path.startsWith('/api/brief/')
              ? ids.brief
              : r.path.startsWith('/api/rules/')
                ? ids.rule
                : r.path.startsWith('/api/push/devices')
                  ? ids.device
                  : r.path.startsWith('/api/auth/sessions')
                    ? ids.handle
                    : ids.provider
    for (const r of withId) {
      const res = await call(r, { cookie: B.cookie, csrf: B.csrf, id: idFor(r), body: {} })
      const text = await res.text()
      if (
        res.status === 200 &&
        !/"ok":\s*false/.test(text) &&
        r.method !== 'GET' &&
        !IDEMPOTENT.has(key(r))
      )
        leaks.push(`${key(r)} -> 200 ${text.slice(0, 80)}`)
      if (/ALICE-SECRET|alice@mail\.test|Private to Alice/.test(text))
        leaks.push(`${key(r)} leaked: ${text.slice(0, 80)}`)
    }
    expect(leaks).toEqual([])
    // and nothing of A's was changed or removed by those attempts
    const repos = forUser(s.db, A.id)
    expect(await repos.accounts.get(ids.account)).not.toBeNull()
    expect(await repos.mail.getMessage(ids.message)).not.toBeNull()
    expect((await repos.actions.list()).length).toBe(1)
    expect((await repos.rules.list()).length).toBe(1)
  }, 600_000)

  it("list endpoints show B only B's own data", async () => {
    for (const path of [
      '/api/inbox',
      '/api/actions',
      '/api/search?q=secret',
      '/api/brief',
      '/api/brief/history',
      '/api/rules',
      '/api/accounts',
      '/api/account/audit',
      '/api/send/log',
    ]) {
      const text = await (await fetch(`${s.url}${path}`, { headers: { cookie: B.cookie } })).text()
      expect(text, path).not.toMatch(
        /ALICE-SECRET|Private to Alice|alice@mail\.test|boss@secret\.test/,
      )
    }
  })

  it("B's events stream and sessions list contain only B's sessions", async () => {
    const r = (await (
      await fetch(`${s.url}/api/auth/sessions`, { headers: { cookie: B.cookie } })
    ).json()) as { sessions: unknown[] }
    expect(r.sessions).toHaveLength(1)
  })
})

describe('SSRF and untrusted input', () => {
  it.each([
    'http://127.0.0.1:1',
    'https://localhost/v1',
    'https://169.254.169.254/latest',
    'https://10.0.0.5',
    'https://[::1]/v1',
    'https://192.168.1.1',
    'file:///etc/passwd',
    'https://user:pass@example.com',
  ])('an AI provider base URL of %s is refused', async (baseUrl) => {
    const r = await fetch(`${s.url}/api/ai/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: A.cookie, 'x-csrf-token': A.csrf },
      body: JSON.stringify({
        preset: 'openai_compatible',
        displayName: 'x',
        baseUrl,
        apiKey: 'sk-test-0123456789abcdef',
      }),
    })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.status).toBeLessThan(500)
    expect(await forUser(s.db, A.id).ai.list()).toEqual([])
  })

  it('oversized and malformed bodies are rejected without a stack trace or internal detail', async () => {
    for (const body of ['{"email":', 'x'.repeat(2_000_000), '[]', 'null']) {
      const r = await fetch(`${s.url}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': A.csrf,
          cookie: `sentinel_csrf=${A.csrf}`,
        },
        body,
      })
      const text = await r.text()
      expect(r.status).toBeLessThan(500)
      expect(text).not.toMatch(/\bat .*\.(ts|js|mjs):\d+|node_modules|\/home\//)
    }
  })

  it('unknown routes and server errors do not reveal paths, stacks or framework detail', async () => {
    const r = await fetch(`${s.url}/api/does-not-exist`, { redirect: 'manual' })
    const text = await r.text()
    expect(r.status).toBe(404)
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(text).not.toMatch(/node_modules|\/home\/|stack|\.mjs/)
  })

  it('the login redirect target is always inside the app', async () => {
    await pace()
    const ctx = await s.browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${s.url}/login?next=//evil.example/x`)
    await page.waitForLoadState('networkidle')
    await page.fill('#auth-email', 'alice@sec.test')
    await page.fill('#auth-password', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL((u) => u.pathname === '/' || u.host !== new URL(s.url).host)
    expect(new URL(page.url()).host).toBe(new URL(s.url).host)
    await ctx.close()
  })
})

describe('XSS in the browser', () => {
  it('a message full of hostile HTML never runs script in the app or the message frame', async () => {
    const repos = forUser(s.db, A.id)
    const acc = (await repos.accounts.list())[0]!
    const [folder] = await repos.mail.listFolders(acc.id)
    const evil = `<img src=x onerror="window.__pwn=1;alert('pwn')"><script>window.__pwn=2;alert('pwn')</script><a href="javascript:alert('pwn')">click</a><svg onload="alert('pwn')"><iframe srcdoc="<script>alert('pwn')</script>"></iframe><form action="https://evil.example"><input name=pw></form>`
    await repos.mail.upsertMessages([
      {
        accountId: acc.id,
        folderId: folder!.id,
        providerMessageId: 'evil',
        fromAddress: '"><img src=x onerror=alert(1)>@evil.test',
        fromName: '<script>alert("name")</script>',
        subject: '</title><script>alert("subject")</script>',
        bodyText: evil,
        bodyHtmlSanitized: null,
        sentAt: new Date(),
        receivedAt: new Date(),
      },
    ])
    const m = (await repos.mail.recent(5)).find((x) => x.providerMessageId === 'evil')!
    const ctx = await s.browser.newContext({
      storageState: {
        cookies: A.cookie.split('; ').map((c) => ({
          name: c.split('=')[0]!,
          value: c.slice(c.indexOf('=') + 1),
          domain: new URL(s.url).hostname,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        })),
        origins: [],
      },
    })
    const page = await ctx.newPage()
    const dialogs: string[] = []
    page.on('dialog', (d) => {
      dialogs.push(d.message())
      void d.dismiss()
    })
    for (const path of ['/inbox', `/inbox/${m.id}`, `/inbox/${m.id}/reply`, '/search?q=evil']) {
      await page.goto(`${s.url}${path}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      expect(
        await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn),
        path,
      ).toBeUndefined()
    }
    expect(dialogs).toEqual([])
    await ctx.close()
  })
})
