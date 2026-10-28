import { z } from 'zod'
import { useAuth } from '../../container'
import { failWith } from '../../utils/respond'

export default defineEventHandler(async (event) => {
  const b = z
    .object({ token: z.string().max(200), password: z.string().max(256) })
    .safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useAuth().confirmPasswordReset(b.data.token, b.data.password)
  return r.ok ? { ok: true } : failWith(event, r.error)
})
