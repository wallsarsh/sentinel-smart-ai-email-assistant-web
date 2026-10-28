import { useConfig } from '../config'
import { CSRF_COOKIE, CSRF_HEADER, checkCsrf, newCsrfToken } from '../security/csrf'

/** Issues the CSRF cookie (readable by the app) and enforces it on mutating API calls. */
export default defineEventHandler((event) => {
  const c = useConfig()
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) {
    if (!getCookie(event, CSRF_COOKIE))
      setCookie(event, CSRF_COOKIE, newCsrfToken(c.sessionSecret), {
        httpOnly: false,
        sameSite: 'strict',
        secure: c.env === 'production',
        path: '/',
      })
    return
  }
  const decision = checkCsrf({
    method: event.method,
    origin: getRequestHeader(event, 'origin'),
    baseUrl: c.baseUrl,
    cookie: getCookie(event, CSRF_COOKIE),
    header: getRequestHeader(event, CSRF_HEADER),
    secret: c.sessionSecret,
  })
  if (decision === 'reject') throw createError({ statusCode: 403, statusMessage: 'csrf' })
})
