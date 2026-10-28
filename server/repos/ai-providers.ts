import { and, eq } from 'drizzle-orm'
import { aiProviders, aiTaskRoutes } from '../db/schema'
import type { Scope } from './scope'

export type ProviderRow = typeof aiProviders.$inferSelect

/** Provider rows only; keys live in the secret store and never pass through here. */
export const aiProvidersRepo = (s: Scope) => {
  const own = (id: string) => and(eq(aiProviders.userId, s.userId), eq(aiProviders.id, id))
  return {
    list: () => s.db.select().from(aiProviders).where(eq(aiProviders.userId, s.userId)),
    async get(id: string) {
      const [r] = await s.db.select().from(aiProviders).where(own(id))
      return r ?? null
    },
    async create(
      v: Pick<
        typeof aiProviders.$inferInsert,
        'kind' | 'displayName' | 'baseUrl' | 'presetId' | 'optionsJson'
      >,
    ) {
      const [r] = await s.db
        .insert(aiProviders)
        .values({ ...v, userId: s.userId })
        .returning()
      return r!
    },
    async update(
      id: string,
      patch: Partial<
        Pick<
          typeof aiProviders.$inferInsert,
          'displayName' | 'baseUrl' | 'status' | 'modelsJson' | 'optionsJson' | 'consentGivenAt'
        >
      >,
    ) {
      const [r] = await s.db.update(aiProviders).set(patch).where(own(id)).returning()
      return r ?? null
    },
    async remove(id: string) {
      const r = await s.db.delete(aiProviders).where(own(id)).returning({ id: aiProviders.id })
      return r.length > 0
    },
    routes: () => s.db.select().from(aiTaskRoutes).where(eq(aiTaskRoutes.userId, s.userId)),
  }
}
