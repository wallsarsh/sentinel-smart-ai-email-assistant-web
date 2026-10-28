import { z } from 'zod'
import { hasRecentStepUp } from '../../auth/mfa'
import { useAuditor, useAuth, useMfa, useSendConfirmation } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const body = z
  .object({
    messageId: z.uuid(),
    previewHash: z.string().length(64),
    placeholderOverride: z.boolean().optional(),
    /** Password re-entry, used when the account has no two-factor to step up with. */
    password: z.string().max(200).optional(),
  })
  .passthrough()

/**
 * The only way to obtain a send authorization. It requires a direct user
 * action: a same-site request with a valid CSRF token (middleware), a live
 * session, and recent step-up (two-factor code, or password when none is set).
 * It does not send: the authorization is released after the undo window.
 */
export default defineEventHandler(async (event) => {
  const { user, session } = await requireUser(event)
  const b = body.safeParse(await readBody(event))
  if (!b.success)
    return failWith(event, {
      kind: 'validation',
      field: String(b.error.issues[0]?.path[0] ?? ''),
      code: 'invalid',
    })

  const mfa = await useMfa().isEnabled(user.id)
  let stepUp = mfa ? hasRecentStepUp(session, new Date()) : false
  if (!mfa && b.data.password)
    stepUp = (
      await useAuth().verifyCredentials(user.email, b.data.password, getRequestIP(event) ?? '')
    ).ok

  const r = await useSendConfirmation().authorize(user.id, session, b.data.messageId, b.data, {
    previewHash: b.data.previewHash,
    placeholderOverride: b.data.placeholderOverride,
    stepUpSatisfied: stepUp,
    confirmedAt: new Date(),
  })
  if (!r.ok) return failWith(event, r.error)
  await useAuditor().record(user.id, 'send_authorized', r.value.ref)
  return {
    nonce: r.value.nonce,
    releaseAt: r.value.releaseAt,
    expiresAt: r.value.expiresAt,
    ref: r.value.ref,
  }
})
