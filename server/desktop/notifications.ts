import type { PushPayload } from '../../server/push/payload'

/** One-process, privacy-preserving native notification bridge.
 * Messages only contain a type. Sender, subject, email body and user id never
 * leave the local worker's policy engine and are never placed on a lock screen.
 */
const QUEUE_LIMIT = 40
const queue: PushPayload['type'][] = []
const allowed = new Set<PushPayload['type']>(['message', 'brief', 'account', 'send', 'test'])

export function queueNativeNotification(type: PushPayload['type']): void {
  if (!allowed.has(type)) return
  if (queue.length >= QUEUE_LIMIT) queue.shift()
  queue.push(type)
}

export function takeNativeNotifications(): PushPayload['type'][] {
  return queue.splice(0)
}
