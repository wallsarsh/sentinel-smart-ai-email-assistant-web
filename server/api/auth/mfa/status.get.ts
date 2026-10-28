import { useDb, useMfa } from '../../../container'
import { forUser } from '../../../repos'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return {
    enabled: await useMfa().isEnabled(user.id),
    recoveryCodesLeft: await forUser(useDb(), user.id).mfa.unusedRecoveryCount(),
  }
})
