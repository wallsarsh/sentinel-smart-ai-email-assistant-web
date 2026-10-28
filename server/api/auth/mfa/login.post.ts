import { z } from 'zod'
import { useAuth, useMfa } from '../../../container'
import { failWith } from '../../../utils/respond'
import { setSessionCookie } from '../../../utils/auth-cookie'

export default defineEventHandler(async (event) => {
  const b = z
    .object({ challenge: z.string().max(400), code: z.string().max(32) })
    .safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useMfa().completeLogin(b.data.challenge, b.data.code)
  if (!r.ok) return failWith(event, r.error)
  setSessionCookie(
    event,
    await useAuth().startSession(r.value.userId, getRequestHeader(event, 'user-agent')),
  )
  return { userId: r.value.userId }
})
