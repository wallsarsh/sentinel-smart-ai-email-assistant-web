import { Worker } from 'node:worker_threads'
import { sanitize, type SanitizeResult } from './sanitize-inline'

export type { SanitizeResult }
/** Bodies above this size are sanitized off the main thread so requests stay responsive. */
export const WORKER_THRESHOLD = 100_000

export function sanitizeHtml(
  html: string,
  opts: { allowRemoteImages?: boolean } = {},
): Promise<SanitizeResult> {
  if (html.length < WORKER_THRESHOLD) return Promise.resolve(sanitize(html, opts))
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { html, opts } })
    w.once('message', resolve)
    w.once('error', reject)
    w.once('exit', (c) => c !== 0 && reject(new Error(`sanitizer worker exited ${c}`)))
  })
}
