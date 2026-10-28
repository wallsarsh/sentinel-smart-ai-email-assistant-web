import { z } from 'zod'
import { useAuth } from '../../container'

export default defineEventHandler(async (event) => {
  const b = z.object({ email: z.string().max(254) }).safeParse(await readBody(event))
  // Same answer whether or not the account exists.
  if (b.success) await useAuth().requestPasswordReset(b.data.email)
  return { ok: true }
})
