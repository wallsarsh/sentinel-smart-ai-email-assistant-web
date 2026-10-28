import { usePush } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return (await usePush().removeDevice(user.id, getRouterParam(event, 'id') ?? ''))
    ? { ok: true }
    : failWith(event, { kind: 'not_found' })
})
