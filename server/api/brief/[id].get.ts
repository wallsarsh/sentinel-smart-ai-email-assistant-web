import { z } from 'zod'
import { useDb } from '../../container'
import { toDailyBrief } from '../../brief/view'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) return failWith(event, { kind: 'not_found' })
  const found = await forUser(useDb(), user.id).briefs.get(id.data)
  return found
    ? { brief: toDailyBrief(found.row, found.items) }
    : failWith(event, { kind: 'not_found' })
})
