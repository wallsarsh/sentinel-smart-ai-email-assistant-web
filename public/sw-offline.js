// Sentinel service worker, offline part (loaded by sw.js).
// ---- Offline shell ---------------------------------------------------------
// What is kept for offline use: the last brief (headline and item text) and the
// first page of the inbox as sender, subject, date, read state and priority.
// No message text, snippet or summary is ever stored, and nothing else is
// cached: pages, message bodies, drafts and every other API response always
// go to the network. When the network is down, a navigation gets a small page
// built here from those two entries. It has no script. Signing out deletes it.
const META_CACHE = 'sentinel-offline-meta-v1'
const BRIEF_KEY = '/offline-data/brief'
const INBOX_KEY = '/offline-data/inbox'

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Reduces an /api/brief response to what may be kept offline. */
function slimBrief(b) {
  if (!b || !b.brief) return null
  return {
    createdAt: str(b.brief.createdAt, 40),
    headline: str(b.brief.headline, 400),
    sections: (Array.isArray(b.brief.sections) ? b.brief.sections : []).slice(0, 4).map((s) => ({
      type: str(s.type, 20),
      items: (Array.isArray(s.items) ? s.items : [])
        .slice(0, 5)
        .map((i) => ({ text: str(i.text, 160) })),
    })),
  }
}

/** Reduces an /api/inbox response to list metadata only (no snippet, summary or body). */
function slimInbox(b) {
  if (!b || !Array.isArray(b.items)) return null
  return {
    items: b.items.slice(0, 30).map((m) => ({
      fromName: str(m.fromName, 100),
      fromAddress: str(m.fromAddress, 200),
      subject: str(m.subject, 200),
      receivedAt: str(m.receivedAt, 40),
      isRead: m.isRead === true,
      priority: str(m.priority, 20),
    })),
  }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

async function readMeta(key) {
  try {
    const hit = await (await caches.open(META_CACHE)).match(key)
    return hit ? await hit.json() : null
  } catch {
    return null
  }
}

/** The page shown for a navigation while offline. Everything in it is escaped; it contains no script. */
function offlinePage(brief, inbox) {
  const when = (iso) => (iso ? new Date(iso).toUTCString() : '')
  const sections = brief
    ? brief.sections
        .map(
          (s) =>
            `<h3>${esc(s.type)}</h3><ul>${s.items.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`,
        )
        .join('')
    : ''
  const rows = inbox
    ? inbox.items
        .map(
          (m) =>
            `<li${m.isRead ? '' : ' style="font-weight:600"'}>${esc(m.subject || '(no subject)')} <small>${esc(m.fromName || m.fromAddress)}</small></li>`,
        )
        .join('')
    : ''
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sentinel (offline)</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:1rem;max-width:40rem;margin-inline:auto;color:#1b1d22;background:#fff}@media(prefers-color-scheme:dark){body{color:#e8eaf0;background:#101216}}.banner{border:1px solid currentColor;padding:.75rem;border-radius:.5rem}small{opacity:.7}li{margin:.25rem 0}</style></head><body><p class="banner" role="status">You are offline. This is the last information Sentinel saved. Opening mail and sending need a connection.</p><h1>Sentinel</h1>${brief ? `<h2>Last brief</h2><p>${esc(brief.headline)}</p><small>${esc(when(brief.createdAt))}</small>${sections}` : ''}${inbox ? `<h2>Inbox</h2><ul>${rows}</ul>` : ''}${!brief && !inbox ? '<p>Nothing saved yet. Open Sentinel once while online.</p>' : ''}<p><a href="/">Try again</a></p></body></html>`
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-sentinel-offline': '1',
    },
  })
}

async function remember(key, slim) {
  if (!slim) return
  const cache = await caches.open(META_CACHE)
  await cache.put(
    key,
    new Response(JSON.stringify(slim), { headers: { 'content-type': 'application/json' } }),
  )
}

async function handleFetch(request) {
  const url = new URL(request.url)
  const isBrief = url.pathname === '/api/brief'
  const isInbox =
    url.pathname === '/api/inbox' &&
    !url.searchParams.has('cursor') &&
    (url.searchParams.get('segment') || 'all') === 'all' &&
    !url.searchParams.has('accountId')
  try {
    const res = await fetch(request)
    if (res.ok && (isBrief || isInbox)) {
      const body = await res
        .clone()
        .json()
        .catch(() => null)
      await remember(isBrief ? BRIEF_KEY : INBOX_KEY, isBrief ? slimBrief(body) : slimInbox(body))
    }
    return res
  } catch (e) {
    if (request.mode === 'navigate')
      return offlinePage(await readMeta(BRIEF_KEY), await readMeta(INBOX_KEY))
    throw e
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const interesting =
    request.mode === 'navigate' || url.pathname === '/api/brief' || url.pathname === '/api/inbox'
  if (!interesting) return // everything else goes straight to the network, uncached
  event.respondWith(handleFetch(request))
})

// The page asks for the offline data to be removed when the user signs out or deletes their account.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-offline-data')
    event.waitUntil(caches.delete(META_CACHE))
})
