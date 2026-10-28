import { z } from 'zod'

/**
 * What a push message may carry: a kind and local ids, nothing else. Push
 * services see the payload (encrypted for the browser), and a lock screen may
 * show the notification, so mail text, names and addresses never travel in it.
 * The service worker fetches display text from the server after the click or,
 * when previews are on, the payload is just a pointer and the app shows the
 * text it already has.
 */
export const pushPayload = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal('brief'), briefId: z.uuid() }).strict(),
  z.object({ type: z.literal('account'), accountId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal('send'),
      ref: z.string().regex(/^[0-9a-f]{16}$/),
      state: z.enum(['sent', 'failed', 'unknown', 'cancelled', 'expired']),
    })
    .strict(),
  z.object({ type: z.literal('test') }).strict(),
])
export type PushPayload = z.infer<typeof pushPayload>

/** Actions a notification may offer. Replying and sending are not among them, by design. */
export const PUSH_ACTIONS = ['open', 'done'] as const
