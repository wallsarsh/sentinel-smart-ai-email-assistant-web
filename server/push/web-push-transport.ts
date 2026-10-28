import webpush from 'web-push'
import type { PushTransport } from './service'

/** The real transport: web-push with the server's VAPID keys. Unconfigured servers report 503 and nothing is sent. */
export function webPushTransport(v: {
  publicKey: string
  privateKey: string
  subject: string
}): PushTransport {
  const configured = v.publicKey !== '' && v.privateKey !== ''
  if (configured) webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  return async (sub, body, o) => {
    if (!configured) return { status: 503 }
    try {
      const r = await webpush.sendNotification(sub, body, {
        TTL: o.ttl,
        urgency: o.urgency,
        timeout: 10_000,
      })
      return { status: r.statusCode }
    } catch (e) {
      return { status: (e as { statusCode?: number }).statusCode ?? 0 }
    }
  }
}
