import { useDb } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return forUser(useDb(), user.id).settings.all()
})
