// Sends the CSRF cookie value as a header on every same-site API request.
export default defineNuxtPlugin(() => {
  const cookie = useCookie('sentinel_csrf')
  globalThis.$fetch = $fetch.create({
    onRequest({ options }) {
      if (cookie.value) {
        const headers = new Headers(options.headers as HeadersInit | undefined)
        headers.set('x-csrf-token', cookie.value)
        options.headers = headers
      }
    },
  }) as typeof $fetch
})
