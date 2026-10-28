import { useHub } from '../container'
import { requireUser } from '../utils/require-user'

/** Server-sent events for the signed-in user (inbox updates, job status, draft streaming). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const stream = createEventStream(event)
  const last = Number(getRequestHeader(event, 'last-event-id'))
  const unsub = useHub().subscribe(
    user.id,
    (ev) => void stream.push({ id: String(ev.id), event: ev.type, data: JSON.stringify(ev.data) }),
    Number.isFinite(last) && last > 0 ? last : undefined,
  )
  const ping = setInterval(() => void stream.push({ event: 'ping', data: '{}' }), 25_000)
  stream.onClosed(async () => {
    clearInterval(ping)
    unsub()
    await stream.close()
  })
  return stream.send()
})
