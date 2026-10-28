import { useMfa } from '../../../container'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return useMfa().begin(user.id, user.email)
})
