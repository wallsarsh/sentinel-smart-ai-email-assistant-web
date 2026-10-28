import { randomUUID } from 'node:crypto'

/** Gives every request an id (from a trusted-format header or fresh) for log correlation. */
export default defineEventHandler((event) => {
  const incoming = getRequestHeader(event, 'x-request-id')
  const id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  event.context.requestId = id
  setResponseHeader(event, 'x-request-id', id)
})
