// Starts the BUILT server against a real, freshly migrated Postgres and gives tests a browser.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import pg from 'pg'
import { createDb, migrateDb, type Db } from '../../server/db/client'

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')
type Browser = import('playwright').Browser

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres:pw@127.0.0.1:5432/sentinel_e2e'

const freePort = () =>
  new Promise<number>((res, rej) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => res(port))
    })
    s.on('error', rej)
  })

/** Empty database + current migrations. */
export async function resetDatabase(url = DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  await pool.query('drop schema if exists public cascade')
  await pool.query('drop schema if exists drizzle cascade')
  await pool.query('create schema public')
  await pool.end()
  await migrateDb(url)
}

export type Stack = {
  url: string
  db: Db
  browser: Browser
  stop(): Promise<void>
  logs(): string
}

export async function startStack(): Promise<Stack> {
  if (!existsSync('.output/server/index.mjs'))
    throw new Error('build first: npm run build (the suite runs the built server)')
  await resetDatabase()
  const { db, close } = createDb(DATABASE_URL)
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  let log = ''
  const child: ChildProcess = spawn('node', ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      BASE_URL: url,
      DATABASE_URL,
      SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef0123456789',
      KEK_BASE64: Buffer.alloc(32, 7).toString('base64'),
      SYSTEM_SMTP_URL: 'smtp://127.0.0.1:1',
      METRICS_TOKEN: METRICS_TOKEN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (d) => (log += d))
  child.stderr?.on('data', (d) => (log += d))
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break
    } catch {
      // not up yet
    }
    if (i > 100 || child.exitCode !== null) throw new Error(`server did not start:\n${log}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch()
  return {
    url,
    db,
    browser,
    logs: () => log,
    async stop() {
      await browser.close()
      child.kill('SIGTERM')
      await close()
    },
  }
}

// The server limits sign-in and sign-up to 10 per minute per address, and every test shares 127.0.0.1.
// The limit stays as in production; the suite paces itself under it.
const authCalls: number[] = []
export async function pace() {
  for (;;) {
    const now = Date.now()
    while (authCalls.length && now - authCalls[0]! > 61_000) authCalls.shift()
    if (authCalls.length < 8) break
    await new Promise((r) => setTimeout(r, authCalls[0]! + 61_000 - now))
  }
  authCalls.push(Date.now())
}

export const METRICS_TOKEN = 'e2e-metrics-token-0123456789'

export const PASSWORD = 'correct horse battery staple'

/** A fresh browser context (own cookies) with a signed-up user, landing on onboarding. */
export async function signUp(s: Stack, email: string) {
  await pace()
  const ctx = await s.browser.newContext({ locale: 'en-US', timezoneId: 'Europe/Berlin' })
  const page = await ctx.newPage()
  await page.goto(`${s.url}/signup`)
  await page.waitForLoadState('networkidle') // hydrated: v-model is bound
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/onboarding')
  await page.waitForSelector('[data-testid=next]')
  return { ctx, page }
}

export async function signIn(s: Stack, email: string, password = PASSWORD) {
  await pace()
  const ctx = await s.browser.newContext({ locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(`${s.url}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', password)
  await page.click('button[type=submit]')
  return { ctx, page }
}
