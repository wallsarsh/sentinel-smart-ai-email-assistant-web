// Handles the notification's "Mark done": the service worker asks an open page (which holds the CSRF token) to do it.
export default defineNuxtPlugin(() => {
  const done = (messageId: string) =>
    $fetch('/api/push/done', { method: 'POST', body: { messageId } }).catch(() => undefined)
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; messageId?: string } | null
    if (d?.type === 'mark-done' && typeof d.messageId === 'string') void done(d.messageId)
  })
  // Opened by a "Mark done" click with no page open: /inbox/<id>?markDone=1
  const m = /^\/inbox\/([0-9a-f-]{36})$/.exec(location.pathname)
  if (m && new URLSearchParams(location.search).get('markDone') === '1') {
    void done(m[1]!)
    history.replaceState(null, '', location.pathname)
  }
})
