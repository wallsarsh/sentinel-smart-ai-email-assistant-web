import { useAuth } from '../../container'
import { clearSessionCookie, sessionToken } from '../../utils/auth-cookie'

export default defineEventHandler(async (event) => {
  const token = sessionToken(event)
  if (token) await useAuth().sessions.revoke(token)
  clearSessionCookie(event)
  return { ok: true }
})
