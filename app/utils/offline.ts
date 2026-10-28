export const OFFLINE_CACHE = 'sentinel-offline-meta-v1'

type CacheStore = { delete(name: string): Promise<boolean> }
type Worker = { postMessage(m: unknown): void } | null | undefined

/**
 * Removes what the service worker kept for offline use (last brief, inbox list
 * metadata). Called whenever someone signs out or deletes their account, so
 * nothing stays behind on a shared computer.
 */
export async function clearOfflineData(
  env: { caches?: CacheStore; controller?: Worker } = {
    ...(typeof caches === 'undefined' ? {} : { caches }),
    ...(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller
      ? { controller: navigator.serviceWorker.controller }
      : {}),
  },
): Promise<void> {
  try {
    env.controller?.postMessage({ type: 'clear-offline-data' })
    await env.caches?.delete(OFFLINE_CACHE)
  } catch {
    // best effort: the next sign-in refreshes the same entries
  }
}
