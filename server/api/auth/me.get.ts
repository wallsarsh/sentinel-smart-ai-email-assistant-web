import { useDb, useMfa } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    locale: user.locale,
    mfaEnabled: await useMfa().isEnabled(user.id),
    onboarded: (await forUser(useDb(), user.id).settings.get('onboarding.complete')) as boolean,
  }
})
