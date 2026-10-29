import { describe, expect, it } from 'vitest'
import { rememberDesktopOAuth, takeDesktopOAuth } from '../../server/mail/oauth/desktop-pending'
import { queueNativeNotification, takeNativeNotifications } from '../../server/desktop/notifications'

describe('standalone OAuth browser handoff', () => {
  it('requires a strong state and burns the continuation exactly once', () => {
    expect(() => rememberDesktopOAuth('https://accounts.google.com/?state=abc', 'user', 'signed'))
      .toThrow('oauth_missing_state')
    const state = 'base64url_24_byte_random_state_123'
    rememberDesktopOAuth('https://accounts.google.com/?state=' + state, 'user-1', 'signed-cookie')
    expect(takeDesktopOAuth('other-state')).toBeNull()
    expect(takeDesktopOAuth(state)).toEqual(expect.objectContaining({
      userId: 'user-1', cookie: 'signed-cookie'
    }))
    expect(takeDesktopOAuth(state)).toBeNull()
  })

  it('rejects callbacks with missing state', () => {
    expect(takeDesktopOAuth(undefined)).toBeNull()
    expect(takeDesktopOAuth('')).toBeNull()
  })
})

describe('standalone notification privacy queue', () => {
  it('only queues recognized kinds, drains once and never includes mail bodies', () => {
    takeNativeNotifications()
    queueNativeNotification('message')
    queueNativeNotification('brief')
    expect(takeNativeNotifications()).toEqual(['message', 'brief'])
    expect(takeNativeNotifications()).toEqual([])
  })
  it('bounds notification memory', () => {
    takeNativeNotifications()
    for (let i = 0; i < 100; ++i) queueNativeNotification('test')
    expect(takeNativeNotifications()).toHaveLength(40)
  })
})
