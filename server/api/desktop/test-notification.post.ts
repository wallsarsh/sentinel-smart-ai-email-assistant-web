import { requireUser } from '../../utils/require-user'
import { queueNativeNotification } from '../../desktop/notifications'
import { desktopMode } from '../../config/index'

export default defineEventHandler(async (event) => {
  if (!desktopMode()) throw createError({ statusCode: 404 })
  await requireUser(event)
  queueNativeNotification('test')
  return { queued: true }
})
