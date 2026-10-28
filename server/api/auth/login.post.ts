import { z } from 'zod'
import { useAuth, useMfa } from '../../container'
import { failWith } from '../../utils/respond'
import { setSessionCookie } from '../../utils/auth-cookie'

const body = z.object({ email: z.string().max(254), password: z.string().max(256) })

export default defineEventHandler(async (event) => {
  const input = body.safeParse(await readBody(event))
  if (!input.success) return failWith(event, { kind: 'validation', code: 'bad_request' })
  const auth = useAuth()
  const r = await auth.verifyCredentials(
    input.data.email,
    input.data.password,
    getRequestIP(event) ?? '',
  )
  if (!r.ok) return failWith(event, r.error)
  const mfa = useMfa()
  if (await mfa.isEnabled(r.value.userId)) {
    // Password is right but no session yet: the second factor completes the login.
    return { mfaRequired: true, challenge: mfa.issueChallenge(r.value.userId) }
  }
  setSessionCookie(
    event,
    await auth.startSession(r.value.userId, getRequestHeader(event, 'user-agent')),
  )
  return { userId: r.value.userId }
})
