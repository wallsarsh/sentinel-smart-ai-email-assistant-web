import { useConfig } from '../../../config'
import { useGoogleOAuth } from '../../../container'
import { OAUTH_COOKIE } from '../../../mail/oauth/google'
import { requireUser } from '../../../utils/require-user'

/** Starts the Google consent flow. A GET navigation; it changes nothing until the callback. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const { url, cookie } = useGoogleOAuth().begin(user.id)
  setCookie(event, OAUTH_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useConfig().secureCookies,
    path: '/api/accounts/google',
    maxAge: 600,
  })
  return sendRedirect(event, url, 302)
})
