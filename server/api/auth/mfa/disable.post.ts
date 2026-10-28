import { z } from 'zod'
import { useMfa, useAuditor } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z.object({ code: z.string().max(32) }).safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useMfa().disable(user.id, b.data.code)
  await useAuditor().record(user.id, r.ok ? 'mfa_disabled' : 'mfa_failed', r.ok ? '' : 'disable')
  return r.ok ? { ok: true } : failWith(event, r.error)
})
