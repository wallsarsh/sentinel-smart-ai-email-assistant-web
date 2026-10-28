import { guardRedirect, type Me } from '~/utils/route-guard'

/** Signed-out visitors go to /login; new users go to /onboarding until done or skipped. */
export default defineNuxtRouteMiddleware(async (to) => {
  const me = useState<Me>('me', () => null)
  const loaded = useState<boolean>('me-loaded', () => false)
  if (!loaded.value || to.path === '/login') {
    try {
      me.value = await useRequestFetch()<Me>('/api/auth/me')
    } catch {
      me.value = null
    }
    loaded.value = true
  }
  const target = guardRedirect(to.path, me.value)
  if (target) return navigateTo(target)
})
