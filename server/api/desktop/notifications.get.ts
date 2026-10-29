import { takeNativeNotifications } from '../../desktop/notifications'

/** Read once with the current sidecar's private challenge, no sessions
 * exposed to native code and no mail content returned. */
export default defineEventHandler((event) => {
  if (process.env.SENTINEL_DESKTOP_MODE !== 'true') {
    throw createError({ statusCode: 404 })
  }
  const challenge = getRequestHeader(event, 'x-sentinel-desktop-probe')
  if (!challenge || challenge !== process.env.SENTINEL_DESKTOP_PROBE) {
    throw createError({ statusCode: 403 })
  }
  setResponseHeader(event, 'cache-control', 'no-store')
  return { events: takeNativeNotifications() }
})
