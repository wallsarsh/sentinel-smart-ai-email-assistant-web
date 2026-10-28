import { useCatalog } from '../../container'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { prices: await useCatalog().prices(user.id) }
})
