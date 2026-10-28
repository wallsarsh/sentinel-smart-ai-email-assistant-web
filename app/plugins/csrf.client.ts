// Sends the CSRF cookie value as a header on every state-changing request to this site (the server
// checks it against the cookie: double submit). This wraps window.fetch rather than $fetch because
// page code gets its own $fetch from the bundle, which a replacement of the global would not reach.
// The cookie is read at request time, so a cookie issued after this plugin ran is still picked up.
const NAME = 'sentinel_csrf'
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const read = () =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${NAME}=`))
    ?.slice(NAME.length + 1)

export default defineNuxtPlugin(() => {
  const native = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const req = input instanceof Request ? input : null
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const url = new URL(
      req?.url ?? String(input instanceof URL ? input.href : input),
      location.href,
    )
    const token = read()
    if (SAFE.has(method) || url.origin !== location.origin || !token) return native(input, init)
    const headers = new Headers(init?.headers ?? req?.headers)
    headers.set('x-csrf-token', decodeURIComponent(token))
    return native(input, { ...init, headers })
  }
})
