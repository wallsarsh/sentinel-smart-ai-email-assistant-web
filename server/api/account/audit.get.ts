import { forUser } from '../../repos'
import { useDb } from '../../container'
import { requireUser } from '../../utils/require-user'

/** The user's own security events (ids and codes only). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const rows = await forUser(useDb(), user.id).audit.list(100)
  return rows.map((r) => ({ at: r.at, event: r.event, detail: r.detail, ip: r.ip }))
})
