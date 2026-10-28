import { existsSync, readFileSync, statSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { clearOfflineData, OFFLINE_CACHE } from '../../app/utils/offline'

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  [k: string]: unknown
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}

function pngSize(path: string) {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

describe('web app manifest (installability)', () => {
  it('has the fields browsers require', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toMatch(/^\//)
    expect(manifest.scope).toBe('/')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('lists 192 and 512 icons plus a maskable one, and every file exists at its stated size', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const i of manifest.icons) {
      const path = `public${i.src}`
      expect(existsSync(path), path).toBe(true)
      const { w, h } = pngSize(path)
      expect(`${w}x${h}`).toBe(i.sizes)
      expect(statSync(path).size).toBeLessThan(100_000)
    }
    pngSize('public/icons/apple-touch-icon.png')
  })

  it('is linked from every page with a theme colour and an Apple touch icon', () => {
    const cfg = readFileSync('nuxt.config.ts', 'utf8')
    expect(cfg).toContain("rel: 'manifest', href: '/manifest.webmanifest'")
    expect(cfg).toContain("name: 'theme-color'")
    expect(cfg).toContain("rel: 'apple-touch-icon'")
    expect(readFileSync('app/plugins/sw.client.ts', 'utf8')).toContain("register('/sw.js')")
  })

  it('the CSP allows the manifest and the worker', () => {
    const cfg = readFileSync('nuxt.config.ts', 'utf8')
    expect(cfg).toContain(`'manifest-src': ["'self'"]`)
    expect(cfg).toContain(`'worker-src': ["'self'"]`)
  })
})

// ---- the service worker, run against fakes ----------------------------------

type Handler = (e: unknown) => void
function loadWorker(network: (url: string, init?: unknown) => Promise<Response>) {
  const handlers: Record<string, Handler> = {}
  const store = new Map<string, Map<string, string>>()
  const caches = {
    async open(name: string) {
      const m = store.get(name) ?? store.set(name, new Map()).get(name)!
      return {
        async put(key: string, res: Response) {
          m.set(key, await res.text())
        },
        async match(key: string) {
          const v = m.get(key)
          return v === undefined
            ? undefined
            : new Response(v, { headers: { 'content-type': 'application/json' } })
        },
      }
    },
    async delete(name: string) {
      return store.delete(name)
    },
  }
  const self = {
    addEventListener: (t: string, h: Handler) => void (handlers[t] = h),
    location: { origin: 'https://app.test' },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined, matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  }
  const ctx = vm.createContext({
    importScripts: (f: string) => vm.runInContext(readFileSync(`public${f}`, 'utf8'), ctx),
    self,
    caches,
    fetch: (r: { url?: string } | string) => network(typeof r === 'string' ? r : (r.url ?? '')),
    Response,
    URL,
    Promise,
    JSON,
    String,
    Array,
    Date,
  })
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), ctx)
  const request = (path: string, o: { method?: string; mode?: string } = {}) => ({
    method: o.method ?? 'GET',
    mode: o.mode ?? 'cors',
    url: `https://app.test${path}`,
  })
  const handled: string[] = []
  async function dispatch(req: ReturnType<typeof request>) {
    let answer: Promise<Response> | null = null
    handlers.fetch!({ request: req, respondWith: (p: Promise<Response>) => (answer = p) })
    if (answer) handled.push(new URL(req.url).pathname)
    return answer as Promise<Response> | null
  }
  return { dispatch, request, store, handlers, handled, caches }
}

const BRIEF = {
  brief: {
    id: 'b1',
    createdAt: '2026-10-28T07:00:00Z',
    headline: 'Two things need you.',
    sections: [
      { type: 'topPriorities', items: [{ text: 'Reply to Alex', messageIds: ['m1'] }] },
      { type: 'fyi', items: [{ text: 'Invoices arrived', messageIds: ['m2', 'm3'] }] },
    ],
    stats: { total: 4 },
    model: 'secret-model',
  },
}
const INBOX = {
  items: [
    {
      id: 'm1',
      accountId: 'a1',
      fromName: 'Alex',
      fromAddress: 'alex@x.test',
      subject: 'Q3 numbers',
      snippet: 'SNIPPET-SECRET the start of the body',
      summary: 'SUMMARY-SECRET',
      receivedAt: '2026-10-28T06:00:00Z',
      isRead: false,
      priority: 'p1_do_now',
      bodyText: 'BODY-SECRET',
    },
  ],
  nextCursor: null,
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

describe('service worker offline behaviour', () => {
  it('only brief, inbox list and page navigations are intercepted; everything else goes straight to the network', async () => {
    const w = loadWorker(async () => json({}))
    for (const p of [
      '/api/messages/m1',
      '/api/drafts/message/m1',
      '/api/search',
      '/api/settings',
      '/_nuxt/app.js',
      '/icons/icon-192.png',
    ])
      expect(await w.dispatch(w.request(p)), p).toBeNull()
    expect(await w.dispatch(w.request('/api/brief', { method: 'POST' }))).toBeNull()
    expect(
      await w.dispatch({ ...w.request('/api/brief'), url: 'https://evil.test/api/brief' }),
    ).toBeNull()
    expect(await w.dispatch(w.request('/api/brief'))).not.toBeNull()
    expect(await w.dispatch(w.request('/inbox', { mode: 'navigate' }))).not.toBeNull()
  })

  it('keeps no mail text: the cache holds only slimmed brief and inbox metadata', async () => {
    const w = loadWorker(async (u) => json(u.includes('/api/brief') ? BRIEF : INBOX))
    await (await w.dispatch(w.request('/api/brief')))!
    await (await w.dispatch(w.request('/api/inbox')))!
    const all = [...(w.store.get('sentinel-offline-meta-v1') ?? new Map()).entries()]
    expect(all.map(([k]) => k).sort()).toEqual(['/offline-data/brief', '/offline-data/inbox'])
    const text = all.map(([, v]) => v).join('\n')
    for (const secret of [
      'SNIPPET-SECRET',
      'SUMMARY-SECRET',
      'BODY-SECRET',
      'secret-model',
      'messageIds',
      'accountId',
      'm1',
      'alex@x.test:',
    ])
      expect(text, secret).not.toContain(secret)
    expect(text).toContain('Q3 numbers')
    expect(text).toContain('Two things need you.')
  })

  it('does not cache paged or filtered inbox lists, failed responses or other endpoints', async () => {
    let status = 200
    const w = loadWorker(async () => json(INBOX, status))
    await (await w.dispatch(w.request('/api/inbox?segment=needs_reply')))!
    await (await w.dispatch(w.request('/api/inbox?cursor=abc')))!
    await (await w.dispatch(
      w.request('/api/inbox?accountId=11111111-1111-4111-8111-111111111111'),
    ))!
    status = 401
    await (await w.dispatch(w.request('/api/inbox')))!
    expect(w.store.size).toBe(0)
  })

  it('offline navigation shows the saved brief and list in a script-free page with an offline notice', async () => {
    let online = true
    const w = loadWorker(async (u) => {
      if (!online) throw new TypeError('offline')
      return json(u.includes('/api/brief') ? BRIEF : INBOX)
    })
    await (await w.dispatch(w.request('/api/brief')))!
    await (await w.dispatch(w.request('/api/inbox')))!
    online = false
    const res = (await w.dispatch(w.request('/inbox/m1', { mode: 'navigate' })))!
    const html = await (await res).text()
    expect(res).toBeTruthy()
    expect(html).toContain('You are offline')
    expect(html).toContain('Two things need you.')
    expect(html).toContain('Reply to Alex')
    expect(html).toContain('Q3 numbers')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain('BODY-SECRET')
    expect(html).not.toContain('SNIPPET-SECRET')
  })

  it('escapes hostile text from the cache', async () => {
    const evil = {
      items: [
        {
          fromName: '<img src=x onerror=alert(1)>',
          fromAddress: 'a@x.test',
          subject: '"><script>alert(1)</script>',
          receivedAt: '',
          isRead: true,
          priority: '',
        },
      ],
    }
    let online = true
    const w = loadWorker(async (u) => {
      if (!online) throw new TypeError('offline')
      return json(
        u.includes('/api/brief')
          ? { brief: { ...BRIEF.brief, headline: '<b onmouseover=1>' } }
          : evil,
      )
    })
    await (await w.dispatch(w.request('/api/brief')))!
    await (await w.dispatch(w.request('/api/inbox')))!
    online = false
    const html = await (await (await w.dispatch(w.request('/', { mode: 'navigate' })))!).text()
    expect(html).not.toMatch(/<script|<img|<b onmouseover/i)
    expect(html).toContain('&lt;script&gt;')
  })

  it('offline with nothing saved says so; offline API calls fail normally instead of inventing data', async () => {
    const w = loadWorker(async () => {
      throw new TypeError('offline')
    })
    const html = await (await (await w.dispatch(w.request('/', { mode: 'navigate' })))!).text()
    expect(html).toContain('Nothing saved yet')
    await expect(w.dispatch(w.request('/api/inbox'))).rejects.toThrow('offline')
  })

  it('a message from the page deletes the offline data', async () => {
    const w = loadWorker(async () => json(BRIEF))
    await (await w.dispatch(w.request('/api/brief')))!
    expect(w.store.size).toBe(1)
    let waited: Promise<unknown> | null = null
    w.handlers.message!({
      data: { type: 'clear-offline-data' },
      waitUntil: (p: Promise<unknown>) => (waited = p),
    })
    await waited
    expect(w.store.size).toBe(0)
  })
})

describe('clearOfflineData', () => {
  it('asks the worker and deletes the cache, and never throws', async () => {
    const sent: unknown[] = []
    const deleted: string[] = []
    await clearOfflineData({
      caches: { delete: async (n) => (deleted.push(n), true) },
      controller: { postMessage: (m) => void sent.push(m) },
    })
    expect(sent).toEqual([{ type: 'clear-offline-data' }])
    expect(deleted).toEqual([OFFLINE_CACHE])
    await expect(
      clearOfflineData({
        caches: {
          delete: async () => {
            throw new Error('x')
          },
        },
      }),
    ).resolves.toBeUndefined()
    await expect(clearOfflineData({})).resolves.toBeUndefined()
  })
})
