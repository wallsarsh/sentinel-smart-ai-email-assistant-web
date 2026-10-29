/**
 * Local, single-process, single-use OAuth handoff. The authenticated WebView
 * starts a provider connection; the OS browser returns to the loopback callback
 * without the WebView's session cookie. PKCE verifier and user identity stay
 * server-side. State is 192 bits of entropy from Google/Microsoft oauth.begin().
 */
const TTL = 10 * 60_000
type Pending = { userId: string; cookie: string; expires: number }
const pending = new Map<string, Pending>()

export function rememberDesktopOAuth(url: string, userId: string, cookie: string): void {
  const state = new URL(url).searchParams.get('state')
  if (!state || state.length < 20) throw new Error('oauth_missing_state')
  const now = Date.now()
  for (const [key, value] of pending) if (value.expires < now) pending.delete(key)
  if (pending.size >= 32) throw new Error('oauth_too_many_pending')
  pending.set(state, { userId, cookie, expires: now + TTL })
}

export function takeDesktopOAuth(state: string | undefined): Pending | null {
  if (!state) return null
  const record = pending.get(state) ?? null
  pending.delete(state) // burn the state before performing token exchange
  return record && record.expires >= Date.now() ? record : null
}
