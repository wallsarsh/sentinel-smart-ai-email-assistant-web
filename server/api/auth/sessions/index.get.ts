import { useAuth } from '../../../container'
import { sessionToken } from '../../../utils/auth-cookie'
import { requireUser } from '../../../utils/require-user'

/** The user's signed-in browsers (never tokens or full hashes). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { sessions: await useAuth().sessions.list(user.id, sessionToken(event)) }
})
