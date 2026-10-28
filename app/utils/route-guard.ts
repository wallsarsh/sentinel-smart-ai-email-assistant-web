export type Me = { id: string; email: string; onboarded: boolean } | null

/** Pages anyone may open. */
const PUBLIC = ['/login', '/signup', '/reset']
const isPublic = (path: string) => PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))

/**
 * Where a visitor must go instead of [path], or null to let them in.
 * Signed-out visitors see only the public pages (with a way back via `next`);
 * new users are sent to onboarding until they finish or skip it.
 */
export function guardRedirect(path: string, me: Me): string | null {
  if (!me) {
    if (isPublic(path)) return null
    const next = path === '/' ? '' : `?next=${encodeURIComponent(path)}`
    return `/login${next}`
  }
  if (path === '/login' || path === '/signup') return me.onboarded ? '/' : '/onboarding'
  if (!me.onboarded && !path.startsWith('/onboarding') && !path.startsWith('/settings'))
    return '/onboarding'
  return null
}

/** A safe in-app target from the `next` query value (never another site). */
export function safeNext(v: unknown): string {
  return typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : '/'
}
