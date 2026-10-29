/** Signals locally packaged standalone mode without leaking secrets. */
export default defineEventHandler(() => ({
  standalone: process.env.SENTINEL_DESKTOP_MODE === 'true',
}))
