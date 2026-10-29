import { requireUser } from '../../utils/require-user'
import { queueNativeNotification } from '../../desktop/notifications'

export default defineEventHandler(async (event) => {
  if (process.env.SENTINEL_DESKTOP_MODE !== 'true') throw createError({ statusCode: 404 })
  await requireUser(event)
  queueNativeNotification('test')
  return { queued: true }
})
