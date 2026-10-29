/** Native process readiness: identifies OUR sidecar rather than an unrelated loopback site. */
export default defineEventHandler((event) => {
  if (process.env.SENTINEL_DESKTOP_MODE !== 'true') throw createError({ statusCode: 404 })
  if (getRequestHeader(event, 'x-sentinel-desktop-probe') !== process.env.SENTINEL_DESKTOP_PROBE)
    throw createError({ statusCode: 403 })
  return { runtime: 'sentinel-desktop', ready: true }
})
