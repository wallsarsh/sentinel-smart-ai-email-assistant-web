// Browser flows against the built server and real Postgres. Mail providers and AI are not reachable
// from here, so mail is seeded through the same repositories the worker uses; connecting, syncing,
// triage, drafting and sending are covered with fakes in tests/unit and tests/send-gate.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authRepo } from '../../server/repos/auth'
import { forUser } from '../../server/repos'
import { METRICS_TOKEN, PASSWORD, signIn, signUp, startStack, type Stack } from './harness'

let s: Stack
beforeAll(async () => {
  s = await startStack()
})
afterAll(async () => s?.stop())

const uid = async (email: string) => (await authRepo(s.db).userByEmail(email))!.id

type Page = import('playwright').Page
const open = async (page: Page, url: string) => {
  await page.goto(url)
  await page.waitForLoadState('networkidle') // hydrated
}
/** Runs [act] and waits for the settings save it triggers. */
const saved = (page: Page, act: () => Promise<unknown>) =>
  Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/settings') && r.request().method() === 'PUT',
    ),
    act(),
  ])

describe('first run', () => {
  it('signed-out visitors are sent to sign-in and come back to where they were going', async () => {
    const ctx = await s.browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${s.url}/inbox`)
    await page.waitForURL(/\/login\?next=(%2F|\/)inbox/)
    await ctx.close()
  })

  it('signup lands on onboarding, which resumes after a reload and can be finished', async () => {
    const { ctx, page } = await signUp(s, 'first@e2e.test')
    const step = async (n: number) => {
      await page.click('[data-testid=next]')
      await page.waitForFunction(
        (t) => document.querySelector('[data-testid=progress]')?.textContent === t,
        `Step ${n} of 5`,
      )
    }
    await step(2)
    await step(3)
    await page.reload()
    expect(await page.textContent('h1')).toContain('Connect your email') // resumed
    await step(4)
    await step(5)
    await page.click('[data-testid=next]') // Finish
    await page.waitForURL(`${s.url}/`)
    await page.waitForSelector('text=No brief yet')
    // now that onboarding is done, going back to it is not forced on the user
    await page.goto(`${s.url}/inbox`)
    expect(page.url()).toBe(`${s.url}/inbox`)
    await ctx.close()
  })

  it('skipping onboarding is remembered', async () => {
    const { ctx, page } = await signUp(s, 'skip@e2e.test')
    await page.click('[data-testid=skip]')
    await page.waitForURL(`${s.url}/`)
    await page.reload()
    expect(page.url()).toBe(`${s.url}/`)
    await ctx.close()
  })
})

describe('signing in and out', () => {
  it('a wrong password is refused with a message; the right one signs in; the cookie is HttpOnly; sign out ends the session', async () => {
    const bad = await signIn(s, 'first@e2e.test', 'not the password!!')
    await bad.page.waitForSelector('[role=alert]')
    expect(bad.page.url()).toContain('/login')
    await bad.ctx.close()

    const { ctx, page } = await signIn(s, 'first@e2e.test')
    await page.waitForURL(`${s.url}/`)
    const cookie = (await ctx.cookies()).find((c) => c.name === 'sentinel_session')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')

    await page.goto(`${s.url}/settings`)
    await page.click('[data-testid=sign-out]')
    await page.waitForURL(/\/login/)
    await page.goto(`${s.url}/settings`)
    await page.waitForURL(/\/login/)
    await ctx.close()
  })

  it('the API refuses unauthenticated calls and calls without the CSRF header', async () => {
    expect((await fetch(`${s.url}/api/settings`)).status).toBe(401)
    const { ctx, page } = await signIn(s, 'first@e2e.test')
    await page.waitForURL(`${s.url}/`)
    const noCsrf = await ctx.request.put(`${s.url}/api/settings`, {
      data: { 'bg.aiEnabled': true },
    })
    expect(noCsrf.status()).toBe(403)
    await ctx.close()
  })

  it('a session revoked from another browser stops working immediately', async () => {
    const a = await signIn(s, 'first@e2e.test')
    await a.page.waitForURL(`${s.url}/`)
    const b = await signIn(s, 'first@e2e.test')
    await b.page.waitForURL(`${s.url}/`)

    await open(a.page, `${s.url}/settings/security`)
    const rows = a.page.locator('[data-testid^=session-]')
    const before = await rows.count() // earlier tests left sessions of this user behind
    const row = a.page
      .locator('[data-testid^=session-]')
      .filter({ hasNot: a.page.locator('[data-testid=current]') })
      .first()
    await row.locator('button').click()
    await a.page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid^=session-]').length === n,
      before - 1,
    )

    await b.page.goto(`${s.url}/inbox`)
    await b.page.waitForURL(/\/login/)
    await a.ctx.close()
    await b.ctx.close()
  })
})

describe('settings persist on the server', () => {
  it('background and privacy changes survive a reload and a new browser', async () => {
    const { ctx, page } = await signIn(s, 'skip@e2e.test')
    await page.waitForURL(`${s.url}/`)
    await open(page, `${s.url}/settings/background`)
    await saved(page, () => page.selectOption('[data-testid=interval]', '60'))
    await saved(page, () => page.check('[data-testid=ai]'))
    await open(page, `${s.url}/settings/privacy`)
    await saved(page, () => page.check('[data-testid=scope-subject]'))
    await saved(page, () => page.uncheck('[data-testid=redact-cards]'))

    const other = await signIn(s, 'skip@e2e.test')
    await other.page.waitForURL(`${s.url}/`)
    await open(other.page, `${s.url}/settings/background`)
    expect(await other.page.inputValue('[data-testid=interval]')).toBe('60')
    expect(await other.page.isChecked('[data-testid=ai]')).toBe(true)
    await open(other.page, `${s.url}/settings/privacy`)
    expect(await other.page.isChecked('[data-testid=scope-subject]')).toBe(true)
    expect(await other.page.isChecked('[data-testid=redact-cards]')).toBe(false)
    const settings = await forUser(s.db, await uid('skip@e2e.test')).settings.all()
    expect(settings['bg.intervalMinutes']).toBe(60)
    await ctx.close()
    await other.ctx.close()
  })
})

describe('mail and brief (seeded)', () => {
  it('shows the stored brief, the inbox and a message, and links from the brief open the message', async () => {
    const { ctx, page } = await signIn(s, 'first@e2e.test')
    await page.waitForURL(`${s.url}/`)
    const id = await uid('first@e2e.test')
    const repos = forUser(s.db, id)
    const acc = await repos.accounts.create({ type: 'imap', email: 'me@e2e.test', displayName: '' })
    await repos.mail.upsertFolders(acc.id, [
      { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
    ])
    const [folder] = await repos.mail.listFolders(acc.id)
    const now = new Date()
    await repos.mail.upsertMessages([
      {
        accountId: acc.id,
        folderId: folder!.id,
        providerMessageId: 'p1',
        fromAddress: 'alex@acme.example',
        fromName: 'Alex Morgan',
        subject: 'Q3 numbers needed',
        snippet: 'Could you send the figures',
        bodyText: 'Could you send the final Q3 figures by Thursday?',
        sentAt: now,
        receivedAt: now,
      },
    ])
    const m = (await repos.mail.recent(5))[0]!
    await repos.triage.save(
      {
        messageId: m.id,
        category: 'work_request',
        importance: 'high',
        urgency: 'urgent',
        priority: 'p1_do_now',
        needsReply: true,
        summary: 'Alex wants the Q3 figures.',
        reason: 'direct',
        source: 'rule',
      } as never,
      [],
    )
    await repos.briefs.save({
      id: '11111111-1111-4111-8111-111111111111',
      windowStart: new Date(now.getTime() - 86_400_000),
      windowEnd: now,
      headline: 'Alex needs the Q3 numbers.',
      stats: { total: 1, needsReply: 1, p1: 1, p2: 0, newsletters: 0, notifications: 0 },
      providerId: null,
      model: null,
      createdAt: now,
      items: [{ section: 'topPriorities', text: 'Send Alex the Q3 numbers', messageIds: [m.id] }],
    })

    await page.goto(`${s.url}/`)
    await page.waitForSelector('[data-testid=headline]')
    expect(await page.textContent('[data-testid=headline]')).toContain('Alex needs the Q3 numbers.')
    expect(await page.textContent('[data-testid=stats]')).toContain('1 emails')
    await page.click('text=Send Alex the Q3 numbers')
    await page.waitForURL(`**/inbox/${m.id}`)
    await page.waitForSelector('text=Q3 numbers needed')

    await page.goto(`${s.url}/inbox`)
    await page.waitForSelector('text=Q3 numbers needed')
    // cross-tenant: another user cannot open this message
    const other = await signIn(s, 'skip@e2e.test')
    await other.page.waitForURL(`${s.url}/`)
    const r = await other.ctx.request.get(`${s.url}/api/messages/${m.id}`)
    expect(r.status()).toBeGreaterThanOrEqual(400)
    await other.ctx.close()
    await ctx.close()
  })
})

describe('wipe', () => {
  it('deleting the account removes the user and everything under it, and signing in no longer works', async () => {
    const { ctx, page } = await signUp(s, 'wipe@e2e.test')
    await page.click('[data-testid=skip]')
    await page.waitForURL(`${s.url}/`)
    const id = await uid('wipe@e2e.test')
    await forUser(s.db, id).accounts.create({ type: 'imap', email: 'w@e2e.test', displayName: '' })

    await open(page, `${s.url}/settings/privacy`)
    await page.click('[data-testid=delete]')
    await page.fill('[data-testid=delete-password]', PASSWORD)
    await page.click('[data-testid=delete-confirm]')
    await page.waitForURL(/\/login/)

    expect(await authRepo(s.db).userByEmail('wipe@e2e.test')).toBeNull()
    expect(await forUser(s.db, id).accounts.list()).toEqual([])
    const again = await signIn(s, 'wipe@e2e.test')
    await again.page.waitForSelector('[role=alert]')
    await again.ctx.close()
    await ctx.close()
  })
})

describe('observability', () => {
  it('readiness is 200 on a migrated database; health is plain', async () => {
    const r = await fetch(`${s.url}/api/ready`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ready: true, checks: { database: true, migrations: true } })
    expect((await fetch(`${s.url}/api/health`)).status).toBe(200)
  })

  it('metrics need the bearer token, and expose route patterns, status classes and queue gauges only', async () => {
    expect((await fetch(`${s.url}/api/metrics`)).status).toBe(401)
    expect(
      (await fetch(`${s.url}/api/metrics`, { headers: { authorization: 'Bearer wrong' } })).status,
    ).toBe(401)
    const id = await uid('first@e2e.test')
    await fetch(`${s.url}/api/messages/${id}`) // an id-shaped path and a 401, as an attacker might probe
    await fetch(`${s.url}/api/search?q=alice@example.test`)
    const r = await fetch(`${s.url}/api/metrics`, {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/plain')
    const text = await r.text()
    expect(text).toContain(
      'sentinel_http_requests_total{method="GET",route="/api/messages/:id",status="4xx"}',
    )
    expect(text).toContain('sentinel_process_uptime_seconds')
    expect(text).toContain('sentinel_job_queue_jobs')
    expect(text).not.toContain(id)
    expect(text).not.toMatch(/@|alice|first@e2e|[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(text.split('\n').length).toBeLessThan(400)
  })
})
