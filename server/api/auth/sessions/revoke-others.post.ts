import { useAuth, useAuditor } from '../../../container'
import { sessionToken } from '../../../utils/auth-cookie'
import { requireUser } from '../../../utils/require-user'

/** "Sign out everywhere else": every session but this one ends. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  await useAuth().sessions.revokeAll(user.id, sessionToken(event))
  await useAuditor().record(user.id, 'session_revoked', 'others')
  return { ok: true }
})
