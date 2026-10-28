import { useDb } from '../../container'
import { toDailyBrief } from '../../brief/view'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

/** Today's (latest) brief, or null before the first one. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const latest = await forUser(useDb(), user.id).briefs.latest()
  return { brief: latest ? toDailyBrief(latest.row, latest.items) : null }
})
