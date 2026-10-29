import { takeNativeNotifications } from '../../desktop/notifications'
import { desktopMode, desktopProbe } from '../../config/index'

/** Read once with the current sidecar's private challenge, no sessions
 * exposed to native code and no mail content returned. */
export default defineEventHandler((event) => {
  if (!desktopMode()) {
    throw createError({ statusCode: 404 })
  }
  const challenge = getRequestHeader(event, 'x-sentinel-desktop-probe')
  if (!challenge || challenge !== desktopProbe()) {
    throw createError({ statusCode: 403 })
  }
  setResponseHeader(event, 'cache-control', 'no-store')
  return { events: takeNativeNotifications() }
})
