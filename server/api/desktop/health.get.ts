import { desktopMode, desktopProbe } from '../../config/index'
/** Native process readiness: identifies OUR sidecar rather than an unrelated loopback site. */
export default defineEventHandler((event) => {
  if (!desktopMode()) throw createError({ statusCode: 404 })
  if (getRequestHeader(event, 'x-sentinel-desktop-probe') !== desktopProbe())
    throw createError({ statusCode: 403 })
  return { runtime: 'sentinel-desktop', ready: true }
})
