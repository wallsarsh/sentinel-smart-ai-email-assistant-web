import { useConfig } from '../../../config'
import { useAuditor, useDb, useGoogleOAuth, tokenKek } from '../../../container'
import { OAUTH_COOKIE, OAuthError } from '../../../mail/oauth/google'
import { saveGoogleAccount } from '../../../mail/oauth/connect'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const q = getQuery(event)
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const cookie = getCookie(event, OAUTH_COOKIE)
  deleteCookie(event, OAUTH_COOKIE, { path: '/api/accounts/google' })
  const back = (r: string) =>
    sendRedirect(event, `${useConfig().baseUrl}/settings/accounts?connect=${r}`, 302)
  try {
    const { tokens, profile } = await useGoogleOAuth().complete({
      userId: user.id,
      code: str(q.code),
      state: str(q.state),
      error: str(q.error),
      cookie,
    })
    const { account, created } = await saveGoogleAccount(
      useDb(),
      tokenKek(),
      user.id,
      profile,
      tokens,
    )
    await useAuditor().record(
      user.id,
      'account_connected',
      `${created ? 'new' : 'reconnect'}:gmail:${account.id}`,
    )
    return back('ok')
  } catch (e) {
    if (e instanceof OAuthError) return back(e.code)
    throw e
  }
})
