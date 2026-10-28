import { useDb } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const rows = await forUser(useDb(), user.id).briefs.history()
  return {
    briefs: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      headline: r.headline,
    })),
  }
})
