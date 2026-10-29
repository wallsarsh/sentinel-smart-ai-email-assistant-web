import { useConfig } from '../../../config'
import { useAuditor, useDb, useMicrosoftOAuth, tokenKek } from '../../../container'
import { OAuthError } from '../../../mail/oauth/google'
import { MS_OAUTH_COOKIE, MsOAuthError } from '../../../mail/oauth/microsoft'
import { saveMicrosoftAccount } from '../../../mail/oauth/connect'
import { requireUser } from '../../../utils/require-user'
import { takeDesktopOAuth } from '../../../mail/oauth/desktop-pending'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const pending =
    process.env.SENTINEL_DESKTOP_MODE === 'true' ? takeDesktopOAuth(str(q.state)) : null
  // A native OAuth browser has a separate cookie jar from the desktop WebView.
  // A one-time state captured by the authenticated start request bridges it
  // without exposing tokens, granting a session or bypassing OAuth PKCE.
  if (process.env.SENTINEL_DESKTOP_MODE === 'true' && !pending) {
    return sendRedirect(event, '/settings/accounts?connect=bad_state', 302)
  }
  const user = pending ? { id: pending.userId } : (await requireUser(event)).user
  const cookie = pending?.cookie ?? getCookie(event, MS_OAUTH_COOKIE)
  deleteCookie(event, MS_OAUTH_COOKIE, { path: '/api/accounts/microsoft' })
  const back = (r: string, help = '') =>
    sendRedirect(
      event,
      `${useConfig().baseUrl}/settings/accounts?connect=${r}${help ? `&help=${help}` : ''}`,
      302,
    )
  try {
    const { tokens, profile } = await useMicrosoftOAuth().complete({
      userId: user.id,
      code: str(q.code),
      state: str(q.state),
      error: str(q.error),
      errorDescription: str(q.error_description),
      cookie,
    })
    const { account, created } = await saveMicrosoftAccount(
      useDb(),
      tokenKek(),
      user.id,
      profile,
      tokens,
    )
    await useAuditor().record(
      user.id,
      'account_connected',
      `${created ? 'new' : 'reconnect'}:microsoft_graph:${account.id}`,
    )
    return back('ok')
  } catch (e) {
    if (e instanceof MsOAuthError) return back(e.code, e.guidance)
    if (e instanceof OAuthError) return back(e.code)
    throw e
  }
})
