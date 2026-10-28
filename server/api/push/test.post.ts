import { usePush } from '../../container'
import { requireUser } from '../../utils/require-user'

/** Sends a test notification to the user's own devices. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return usePush().send(user.id, { type: 'test' }, { urgency: 'low' })
})
