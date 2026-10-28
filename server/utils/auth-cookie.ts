import type { H3Event } from 'h3'
import { useConfig } from '../config'
import { SESSION_COOKIE, cookieOptions } from '../auth/sessions'

export const setSessionCookie = (event: H3Event, token: string) =>
  setCookie(event, SESSION_COOKIE, token, cookieOptions(useConfig().env === 'production'))
export const clearSessionCookie = (event: H3Event) =>
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
export const sessionToken = (event: H3Event) => getCookie(event, SESSION_COOKIE)
