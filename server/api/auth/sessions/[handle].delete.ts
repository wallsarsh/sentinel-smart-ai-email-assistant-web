import { useAuth, useAuditor } from '../../../container'
import { failWith } from '../../../utils/respond'
import { clearSessionCookie, sessionToken } from '../../../utils/auth-cookie'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const handle = getRouterParam(event, 'handle') ?? ''
  const auth = useAuth()
  const wasCurrent = (await auth.sessions.list(user.id, sessionToken(event))).some(
    (s) => s.handle === handle && s.current,
  )
  if (!(await auth.sessions.revokeByHandle(user.id, handle)))
    return failWith(event, { kind: 'not_found' })
  await useAuditor().record(user.id, 'session_revoked')
  if (wasCurrent) clearSessionCookie(event)
  return { ok: true }
})
