import type { H3Event } from 'h3'
import { useAuth } from '../container'
import { sessionToken } from './auth-cookie'

/** The signed-in user, or a 401. Every protected route starts with this. */
export async function requireUser(event: H3Event) {
  const found = await useAuth().sessions.validate(sessionToken(event))
  if (!found) throw createError({ statusCode: 401, statusMessage: 'unauthenticated' })
  event.context.userId = found.user.id
  return found
}
