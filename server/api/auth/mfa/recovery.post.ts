import { z } from 'zod'
import { useMfa, useAuditor } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** New recovery codes (the old ones stop working). Needs a current code. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ code: z.string().max(32) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useMfa().regenerateRecoveryCodes(user.id, b.data.code)
  await useAuditor().record(
    user.id,
    r.ok ? 'recovery_codes_regenerated' : 'mfa_failed',
    r.ok ? '' : 'recovery',
  )
  return r.ok ? { recoveryCodes: r.value } : failWith(event, r.error)
})
