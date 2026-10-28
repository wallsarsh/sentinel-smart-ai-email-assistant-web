import { z } from 'zod'
import { useAuth } from '../../container'
import { failWith } from '../../utils/respond'
import { setSessionCookie } from '../../utils/auth-cookie'

const body = z.object({
  email: z.string().max(254),
  password: z.string().max(256),
  timezone: z.string().max(64).optional(),
})

export default defineEventHandler(async (event) => {
  const input = body.safeParse(await readBody(event))
  if (!input.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = await useAuth().signup({
    ...input.data,
    userAgent: getRequestHeader(event, 'user-agent'),
  })
  if (!r.ok) return failWith(event, r.error)
  setSessionCookie(event, r.value.token)
  return { userId: r.value.userId }
})
