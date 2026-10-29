import { useAiProviders, useAiRouter } from '../../container'
import { requireUser } from '../../utils/require-user'

/** What is still missing before AI features (sorting, brief, drafts) can work. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const providers = await useAiProviders().list(user.id)
  const route = (await useAiRouter().routesFor(user.id, 'default'))[0]
  const routed = providers.find((p) => p.id === route?.providerId)
  return {
    providers: providers.length,
    hasModel: !!routed,
    consented: providers.some((p) => !!p.consentGivenAt),
    models: [...new Set(providers.flatMap((p) => p.models))].slice(0, 200),
    providerId: routed?.id ?? providers[0]?.id ?? null,
  }
})
