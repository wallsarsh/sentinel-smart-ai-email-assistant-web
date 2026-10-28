import { useAiProviders } from '../../../container'
import { PRESETS } from '../../../ai/presets'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { providers: await useAiProviders().list(user.id), presets: PRESETS }
})
