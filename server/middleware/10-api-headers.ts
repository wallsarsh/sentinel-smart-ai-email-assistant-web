/** API responses carry account data and session state: nothing may keep a copy (browser, proxy or CDN). */
export default defineEventHandler((event) => {
  if (!getRequestURL(event).pathname.startsWith('/api/')) return
  setResponseHeader(event, 'cache-control', 'no-store')
})
