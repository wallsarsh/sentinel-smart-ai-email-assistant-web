import { usePush } from '../../container'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { devices: await usePush().devices(user.id) }
})
