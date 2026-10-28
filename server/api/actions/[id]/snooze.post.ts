import { useDb } from '../../../container'
import { zoneOffset } from '../../../ai/prompts/builder'
import { forUser } from '../../../repos'
import { authRepo } from '../../../repos/auth'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'
import { tomorrowMorning } from '../../../../shared/actions'

/** Snoozes an action item until 08:00 tomorrow in the user's time zone. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const db = useDb()
  const tz = (await authRepo(db).userById(user.id))?.timezone || 'UTC'
  const until = tomorrowMorning(new Date(), (d) => {
    try {
      return zoneOffset(tz, d)
    } catch {
      return 0
    }
  })
  const ok = await forUser(db, user.id).actions.snooze(getRouterParam(event, 'id') ?? '', until)
  return ok ? { ok: true, until } : failWith(event, { kind: 'not_found' })
})
