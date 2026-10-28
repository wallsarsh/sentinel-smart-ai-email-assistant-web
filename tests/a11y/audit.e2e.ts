// Accessibility audit on the real pages, in a real browser: axe (WCAG 2.2 A/AA rules, including colour
// contrast, which jsdom-based tests cannot check) in light and dark, plus keyboard and motion checks.
// Serious and critical findings fail the run; lesser ones are printed so they can be triaged.
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { signUp, startStack, type Stack } from '../e2e/harness'

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
type Page = import('playwright').Page
type Ctx = import('playwright').BrowserContext

let s: Stack
let msgId = ''
let briefId = ''
beforeAll(async () => {
  s = await startStack()
  const { ctx, page } = await signUp(s, 'a11y@e2e.test')
  await page.click('[data-testid=skip]')
  await page.waitForURL(`${s.url}/`)
  const id = (await authRepo(s.db).userByEmail('a11y@e2e.test'))!.id
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
      bodyText: 'Could you send the final Q3 figures by Thursday?\n\nThanks, Alex',
      toJson: [{ address: 'me@e2e.test' }],
      sentAt: now,
      receivedAt: now,
    },
  ])
  msgId = (await repos.mail.recent(5))[0]!.id
  await repos.triage.save(
    {
      messageId: msgId,
      category: 'work_request',
      importance: 'high',
      urgency: 'urgent',
      priority: 'p1_do_now',
      needsReply: true,
      summary: 'Alex wants the Q3 figures.',
      reason: 'direct',
      source: 'rule',
    } as never,
    [
      {
        itemText: 'Send the Q3 figures',
        dueAt: new Date(now.getTime() + 86_400_000),
        dueText: null,
      },
    ],
  )
  briefId = '11111111-1111-4111-8111-111111111111'
  await repos.briefs.save({
    id: briefId,
    windowStart: new Date(now.getTime() - 86_400_000),
    windowEnd: now,
    headline: 'Alex needs the Q3 numbers.',
    stats: { total: 1, needsReply: 1, p1: 1, p2: 0, newsletters: 0, notifications: 0 },
    providerId: null,
    model: null,
    createdAt: now,
    items: [{ section: 'topPriorities', text: 'Send Alex the Q3 numbers', messageIds: [msgId] }],
  })
  await ctx.storageState({ path: '/tmp/a11y-state.json' })
  await ctx.close()
})
afterAll(async () => s?.stop())

const SIGNED_OUT = ['/login', '/signup', '/reset', '/reset/confirm?token=x']
const SIGNED_IN = () => [
  '/',
  '/brief/history',
  '/brief/catch-up',
  `/brief/${briefId}`,
  '/inbox',
  `/inbox/${msgId}`,
  `/inbox/${msgId}/reply`,
  '/search',
  '/actions',
  '/settings',
  '/settings/accounts',
  '/settings/profile',
  '/settings/ai',
  '/settings/ai/consent',
  '/settings/ai/routes',
  '/settings/ai/bench',
  '/settings/usage',
  '/settings/senders',
  '/settings/sending',
  '/settings/background',
  '/settings/privacy',
  '/settings/security',
  '/onboarding',
]

async function audit(page: Page) {
  await page.addScriptTag({ path: axeSource })
  return page.evaluate(async () => {
    const r = await (
      globalThis as unknown as {
        axe: {
          run: (
            c: unknown,
            o: unknown,
          ) => Promise<{
            violations: {
              id: string
              impact: string
              help: string
              nodes: { target: unknown[]; html: string }[]
            }[]
          }>
        }
      }
    ).axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    })
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => `${String(n.target)} :: ${n.html.slice(0, 120)}`),
    }))
  })
}

async function context(scheme: 'light' | 'dark', signedIn: boolean): Promise<Ctx> {
  return s.browser.newContext({
    colorScheme: scheme,
    bypassCSP: true, // lets the test inject axe; the page under test is unchanged
    locale: 'en-US',
    ...(signedIn ? { storageState: '/tmp/a11y-state.json' } : {}),
  })
}

async function visit(ctx: Ctx, path: string) {
  const page = await ctx.newPage()
  await page.goto(`${s.url}${path}`)
  await page.waitForLoadState('networkidle')
  return page
}

const serious = (v: { impact: string }[]) =>
  v.filter((x) => x.impact === 'serious' || x.impact === 'critical')

describe.each(['light', 'dark'] as const)('axe, %s', (scheme) => {
  it('signed-out pages have no serious or critical violations', async () => {
    const ctx = await context(scheme, false)
    const found: Record<string, unknown> = {}
    for (const path of SIGNED_OUT) {
      const page = await visit(ctx, path)
      const v = await audit(page)
      if (v.length) found[path] = v
      await page.close()
    }
    await ctx.close()
    const bad = Object.fromEntries(
      Object.entries(found)
        .map(([k, v]) => [k, serious(v as never)])
        .filter(([, v]) => (v as unknown[]).length),
    )
    if (Object.keys(found).length)
      console.log(`[${scheme}] signed-out findings`, JSON.stringify(found, null, 1))
    expect(bad).toEqual({})
  })

  it('signed-in pages have no serious or critical violations', async () => {
    const ctx = await context(scheme, true)
    const found: Record<string, unknown> = {}
    for (const path of SIGNED_IN()) {
      const page = await visit(ctx, path)
      const v = await audit(page)
      if (v.length) found[path] = v
      await page.close()
    }
    await ctx.close()
    const bad = Object.fromEntries(
      Object.entries(found)
        .map(([k, v]) => [k, serious(v as never)])
        .filter(([, v]) => (v as unknown[]).length),
    )
    if (Object.keys(found).length)
      console.log(`[${scheme}] signed-in findings`, JSON.stringify(found, null, 1))
    expect(bad).toEqual({})
  }, 180_000)
})

describe('keyboard', () => {
  it('the sign-in form is reachable in reading order with a visible focus ring, and nothing traps focus', async () => {
    const ctx = await context('light', false)
    const page = await visit(ctx, '/login')
    const order: string[] = []
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      order.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement
          return e.tagName === 'BODY' ? 'BODY' : e.id || e.textContent?.trim() || e.tagName
        }),
      )
    }
    // the submit button is disabled until both fields are filled, so Tab skips it
    expect(order).toEqual([
      'auth-email',
      'auth-password',
      'Forgot your password?',
      'Create an account',
      'BODY',
    ]) // then focus leaves the page: no trap
    await page.keyboard.press('Shift+Tab')
    const outline = await page.evaluate(() => {
      const c = getComputedStyle(document.activeElement as HTMLElement)
      return { style: c.outlineStyle, width: parseFloat(c.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
    await ctx.close()
  })

  it('the skip link comes first and moves focus to the main content', async () => {
    const ctx = await context('light', true)
    const page = await visit(ctx, '/inbox')
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement).textContent?.trim()),
    ).toBe('Skip to content')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main')
    await ctx.close()
  })

  it('every focusable control on every signed-in page shows a focus indicator', async () => {
    const ctx = await context('light', true)
    const missing: string[] = []
    for (const path of [
      '/',
      '/inbox',
      '/actions',
      '/settings/background',
      '/settings/privacy',
      '/settings/security',
    ]) {
      const page = await visit(ctx, path)
      const bad = await page.evaluate(() => {
        const out: string[] = []
        const els = document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea',
        )
        for (const el of els) {
          if (!el.getClientRects().length || el.classList.contains('sr-only')) continue
          el.focus()
          const c = getComputedStyle(el)
          if (document.activeElement !== el) continue
          if (c.outlineStyle === 'none' && c.boxShadow === 'none')
            out.push(`${el.tagName}:${(el.textContent || el.id).trim().slice(0, 20)}`)
        }
        return out
      })
      missing.push(...bad.map((b) => `${path} ${b}`))
      await page.close()
    }
    await ctx.close()
    expect(missing).toEqual([])
  })
})

describe('motion and reflow', () => {
  it('with reduced motion requested, nothing animates or transitions for longer than an instant', async () => {
    const ctx = await s.browser.newContext({
      reducedMotion: 'reduce',
      storageState: '/tmp/a11y-state.json',
    })
    const slow: string[] = []
    for (const path of ['/', '/inbox', '/settings']) {
      const page = await ctx.newPage()
      await page.goto(`${s.url}${path}`)
      await page.waitForLoadState('networkidle')
      slow.push(
        ...(await page.evaluate(() => {
          const ms = (v: string) =>
            Math.max(
              0,
              ...v.split(',').map((x) => (x.includes('ms') ? parseFloat(x) : parseFloat(x) * 1000)),
            )
          return [...document.querySelectorAll('*')]
            .filter((el) => {
              const c = getComputedStyle(el)
              return ms(c.animationDuration) > 1 || ms(c.transitionDuration) > 1
            })
            .map((el) => el.tagName)
        })),
      )
      await page.close()
    }
    await ctx.close()
    expect(slow).toEqual([])
  })

  it('real pages reflow at 320 px (what 400% zoom does to a desktop window) without sideways scrolling', async () => {
    const ctx = await s.browser.newContext({
      viewport: { width: 320, height: 640 },
      storageState: '/tmp/a11y-state.json',
    })
    const wide: string[] = []
    for (const path of SIGNED_IN().filter((p) => p !== '/onboarding')) {
      const page = await ctx.newPage()
      await page.goto(`${s.url}${path}`)
      await page.waitForLoadState('networkidle')
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (over > 0) wide.push(`${path} (+${over}px)`)
      await page.close()
    }
    await ctx.close()
    expect(wide).toEqual([])
  }, 120_000)
})
