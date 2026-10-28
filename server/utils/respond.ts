import type { H3Event } from 'h3'
import { httpStatusFor, toWire, type AppFailure } from '../../shared/errors/failure'

/** Sends a failure as `{error:{kind,detail}}` with the matching status; no free text. */
export function failWith(event: H3Event, f: AppFailure): { error: ReturnType<typeof toWire> } {
  setResponseStatus(event, httpStatusFor(f))
  return { error: toWire(f) }
}
