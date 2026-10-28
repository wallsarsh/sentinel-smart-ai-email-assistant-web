// Sentinel service worker: shows notifications for pushes and handles their two actions.
// Payloads carry a kind and ids only. Display text is generic. Notifications offer two actions and no others.
const TITLES = {
  message: 'New mail',
  brief: 'Your daily brief is ready',
  account: 'An account needs attention',
  send: 'Send status',
  test: 'Notifications are working',
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const type = typeof data.type === 'string' && data.type in TITLES ? data.type : 'test'
  const id = data.messageId || data.briefId || data.accountId || data.ref || ''
  event.waitUntil(
    self.registration.showNotification(TITLES[type], {
      tag: `${type}:${id}`, // the same message never stacks up twice
      data: { type, id },
      // Open and Mark done are the only actions.
      actions: type === 'message' ? [{ action: 'open', title: 'Open' }, { action: 'done', title: 'Mark done' }] : [{ action: 'open', title: 'Open' }],
    }),
  )
})

const target = (d) => {
  if (d.type === 'message' && d.id) return `/inbox/${encodeURIComponent(d.id)}`
  if (d.type === 'brief') return '/'
  if (d.type === 'account') return '/settings/accounts'
  if (d.type === 'send') return '/settings/sending'
  return '/settings/background'
}

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {}
  event.notification.close()
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (event.action === 'done' && d.type === 'message' && d.id) {
        // The page performs the request (it holds the CSRF token); with no page open, open one that does.
        if (wins[0]) return wins[0].postMessage({ type: 'mark-done', messageId: d.id })
        return self.clients.openWindow(`${target(d)}?markDone=1`)
      }
      const url = target(d)
      const open = wins.find((w) => 'focus' in w)
      if (open) {
        await open.focus()
        return 'navigate' in open ? open.navigate(url) : undefined
      }
      return self.clients.openWindow(url)
    })(),
  )
})
