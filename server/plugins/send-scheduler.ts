import { useConfig } from '../config'
import { useSendScheduler } from '../container'

/** Starts the delayed-submit loop with the server. The undo window lives here, not in browsers. */
export default defineNitroPlugin((nitro) => {
  if (useConfig().env === 'test') return
  const s = useSendScheduler()
  s.start()
  nitro.hooks.hook('close', () => s.stop())
})
