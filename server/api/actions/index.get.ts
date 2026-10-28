import { useDb } from '../../container'
import { zoneOffset } from '../../ai/prompts/builder'
import { forUser } from '../../repos'
import { authRepo } from '../../repos/auth'
import { requireUser } from '../../utils/require-user'
import { groupActions } from '../../../shared/actions'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const db = useDb()
  const tz = (await authRepo(db).userById(user.id))?.timezone || 'UTC'
  const offsetAt = (d: Date) => {
    try {
      return zoneOffset(tz, d)
    } catch {
      return 0
    }
  }
  return { groups: groupActions(await forUser(db, user.id).actions.list(), new Date(), offsetAt) }
})
