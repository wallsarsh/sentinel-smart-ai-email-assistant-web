import { z } from 'zod'
import { useLifecycle } from '../../container'
import { failWith } from '../../utils/respond'
import { clearSessionCookie } from '../../utils/auth-cookie'
import { requireStepUp } from '../../utils/step-up'

export default defineEventHandler(async (event) => {
  const { user } = await requireStepUp(event)
  const b = z.object({ password: z.string().max(256) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useLifecycle().deleteAccount(user.id, b.data.password)
  if (!r.ok) return failWith(event, r.error)
  clearSessionCookie(event)
  return { ok: true, revocationFailures: r.value.revocationFailures }
})
