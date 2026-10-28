import { useConfig } from '../../../config'
import { useAuditor, useDb, useMicrosoftOAuth, tokenKek } from '../../../container'
import { OAuthError } from '../../../mail/oauth/google'
import { MS_OAUTH_COOKIE, MsOAuthError } from '../../../mail/oauth/microsoft'
import { saveMicrosoftAccount } from '../../../mail/oauth/connect'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const q = getQuery(event)
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const cookie = getCookie(event, MS_OAUTH_COOKIE)
  deleteCookie(event, MS_OAUTH_COOKIE, { path: '/api/accounts/microsoft' })
  const back = (r: string, help = '') =>
    sendRedirect(
      event,
      `${useConfig().baseUrl}/accounts?connect=${r}${help ? `&help=${help}` : ''}`,
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
