import { forUser } from '../../repos'
import { useDb } from '../../container'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { routes: await forUser(useDb(), user.id).ai.routes() }
})
