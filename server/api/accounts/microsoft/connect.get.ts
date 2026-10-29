import { useConfig } from '../../../config'
import { useMicrosoftOAuth } from '../../../container'
import { MS_OAUTH_COOKIE } from '../../../mail/oauth/microsoft'
import { requireUser } from '../../../utils/require-user'
import { rememberDesktopOAuth } from '../../../mail/oauth/desktop-pending'

/** Starts the Google consent flow. A GET navigation; it changes nothing until the callback. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const { url, cookie } = useMicrosoftOAuth().begin(user.id)
  if (process.env.SENTINEL_DESKTOP_MODE === 'true') {
    rememberDesktopOAuth(url, user.id, cookie)
  }
  setCookie(event, MS_OAUTH_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useConfig().secureCookies,
    path: '/api/accounts/microsoft',
    maxAge: 600,
  })
  return sendRedirect(event, url, 302)
})
