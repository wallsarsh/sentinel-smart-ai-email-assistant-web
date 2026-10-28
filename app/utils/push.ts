export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

/** VAPID public key (base64url) → bytes for pushManager.subscribe. */
export function keyToBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type Env = {
  Notification?: {
    permission: NotificationPermission
    requestPermission(): Promise<NotificationPermission>
  }
  serviceWorker?: {
    register(url: string): Promise<{ pushManager: PushManagerLike }>
    ready: Promise<{ pushManager: PushManagerLike }>
  }
  hasPushManager: boolean
}
type SubLike = {
  endpoint: string
  toJSON(): { endpoint?: string; keys?: Record<string, string> }
  unsubscribe(): Promise<boolean>
}
type PushManagerLike = {
  getSubscription(): Promise<SubLike | null>
  subscribe(o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<SubLike>
}

export function browserEnv(): Env {
  const w = globalThis as unknown as {
    Notification?: Env['Notification']
    navigator?: { serviceWorker?: Env['serviceWorker'] }
    PushManager?: unknown
  }
  return {
    Notification: w.Notification,
    serviceWorker: w.navigator?.serviceWorker,
    hasPushManager: !!w.PushManager,
  }
}

/** Where notification setup stands: unsupported browser, server without keys, blocked, off or on. */
export async function pushState(env: Env, serverConfigured: boolean): Promise<PushState> {
  if (!env.Notification || !env.serviceWorker || !env.hasPushManager) return 'unsupported'
  if (!serverConfigured) return 'unconfigured'
  if (env.Notification.permission === 'denied') return 'denied'
  if (env.Notification.permission !== 'granted') return 'off'
  const reg = await env.serviceWorker.ready.catch(() => null)
  return reg && (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/**
 * Turns notifications on. Must be called from a click: the permission prompt
 * is only shown for a user gesture, and Sentinel never asks on its own.
 */
export async function enablePush(
  env: Env,
  publicKey: string,
  send: (sub: { endpoint: string; keys: Record<string, string> }) => Promise<void>,
): Promise<PushState> {
  if (!env.Notification || !env.serviceWorker) return 'unsupported'
  const perm =
    env.Notification.permission === 'granted'
      ? 'granted'
      : await env.Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await env.serviceWorker.register('/sw.js')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    }))
  const j = sub.toJSON()
  await send({ endpoint: sub.endpoint, keys: j.keys ?? {} })
  return 'on'
}

export async function disablePush(
  env: Env,
  forget: (endpoint: string) => Promise<void>,
): Promise<void> {
  const reg = await env.serviceWorker?.ready.catch(() => null)
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await forget(sub.endpoint)
  await sub.unsubscribe()
}
