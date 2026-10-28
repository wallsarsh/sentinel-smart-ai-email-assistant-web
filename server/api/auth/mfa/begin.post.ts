import { useMfa } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const mfa = useMfa()
  if (await mfa.isEnabled(user.id))
    return failWith(event, { kind: 'validation', field: 'mfa', code: 'already_enabled' })
  return mfa.begin(user.id, user.email)
})
