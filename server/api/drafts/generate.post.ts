import { z } from 'zod'
import { useDraftGenerator } from '../../container'
import { AiStreamError } from '../../ai/types'
import { toWire } from '../../../shared/errors/failure'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const body = z.object({
  messageId: z.uuid(),
  tone: z.enum(['professional', 'friendly', 'concise', 'formal']),
  intent: z.enum(['accept', 'decline', 'ask_for_info', 'acknowledge', 'custom']),
  instruction: z.string().max(500).optional(),
})

/**
 * Streams a draft as server-sent events (delta, done, error). The browser
 * cancels by aborting the request, which stops the upstream model call.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = body.safeParse(await readBody(event))
  if (!b.success)
    return failWith(event, {
      kind: 'validation',
      field: String(b.error.issues[0]?.path[0] ?? ''),
      code: 'invalid',
    })
  const stream = createEventStream(event)
  const ctl = new AbortController()
  const gen = useDraftGenerator().generate({ userId: user.id, ...b.data, signal: ctl.signal })
  stream.onClosed(() => ctl.abort())

  void (async () => {
    try {
      for await (const ev of gen) await stream.push({ event: ev.type, data: JSON.stringify(ev) })
    } catch (e) {
      const failure = e instanceof AiStreamError ? e.failure : ({ kind: 'unknown' } as const)
      await stream.push({ event: 'error', data: JSON.stringify(toWire(failure)) })
    } finally {
      await stream.close()
    }
  })()
  return stream.send()
})
