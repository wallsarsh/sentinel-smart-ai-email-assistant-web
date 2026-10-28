import { useDb } from '../../container'
import { zoneOffset } from '../../ai/prompts/builder'
import { toDailyBrief } from '../../brief/view'
import { forUser } from '../../repos'
import { authRepo } from '../../repos/auth'
import { requireUser } from '../../utils/require-user'
import { isBriefDue } from '../../../shared/brief-schedule'

/** The latest brief, or null before the first one; `due` tells the page to write today's on open. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const db = useDb()
  const repos = forUser(db, user.id)
  const latest = await repos.briefs.latest()
  const tz = (await authRepo(db).userById(user.id))?.timezone || 'UTC'
  const offsetAt = (at: Date) => {
    try {
      return zoneOffset(tz, at)
    } catch {
      return 0
    }
  }
  const due =
    (await repos.accounts.list()).some((a) => a.status === 'active') &&
    isBriefDue({
      now: new Date(),
      minutes: (await repos.settings.get('brief.minutes')) as number,
      lastCreatedAt: latest?.row.createdAt ?? null,
      offsetAt,
    })
  return { brief: latest ? toDailyBrief(latest.row, latest.items) : null, due }
})
