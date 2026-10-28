import { createLiveClient, type LiveStatus } from '../utils/live-client'

/** Event types the server publishes (see WEB §6). */
export const LIVE_TYPES = [
  'inbox.changed',
  'triage.done',
  'draft.chunk',
  'draft.done',
  'brief.ready',
  'job.status',
] as const

let client: ReturnType<typeof createLiveClient> | undefined
const status = ref<LiveStatus>('connecting')

/** One shared event stream per tab; views register handlers and get cleaned up with the component. */
export function useLive() {
  if (import.meta.client && !client) {
    client = createLiveClient({
      open: () => new EventSource('/api/events') as never,
      types: [...LIVE_TYPES],
      onStatus: (s) => (status.value = s),
    })
    client.start()
  }
  return {
    status,
    on(type: (typeof LIVE_TYPES)[number], h: (d: Record<string, unknown>) => void) {
      const off = client?.on(type, h)
      if (off && getCurrentInstance()) onUnmounted(off)
      return off
    },
  }
}
