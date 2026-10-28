import type { H3Event } from 'h3'
import { hasRecentStepUp } from '../auth/mfa'
import { useMfa } from '../container'
import { requireUser } from './require-user'

/**
 * Sensitive routes (account deletion, export, sending) call this: users with
 * two-factor must have verified a code in the last ten minutes.
 */
export async function requireStepUp(event: H3Event) {
  const found = await requireUser(event)
  if ((await useMfa().isEnabled(found.user.id)) && !hasRecentStepUp(found.session, new Date()))
    throw createError({ statusCode: 403, statusMessage: 'step_up_required' })
  return found
}
