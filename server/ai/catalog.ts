import type { Db } from '../db/client'
import { forUser } from '../repos'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { AiUsage } from './types'

/** USD per one million tokens, entered by the user. Nothing is shipped. */
export type Price = { in: number; out: number }
export type Prices = Record<string, Price>

export type Cost = {
  micros: number
  /** True when the model has no price entered, so the cost shows as 0 with a hint. */ unpriced: boolean
}

/**
 * cost (micro-USD) = tokens x USD-per-million. Cached input tokens are billed
 * at the input price (a cautious upper bound; providers discount them).
 */
export function computeCost(usage: AiUsage, price: Price | undefined): Cost {
  if (!price) return { micros: 0, unpriced: true }
  const input = usage.inputTokens + usage.cachedTokens
  return { micros: Math.round(input * price.in + usage.outputTokens * price.out), unpriced: false }
}

export function catalog(db: Db) {
  return {
    /** Models the provider last reported, merged with every model that has a price or a route. */
    async models(userId: string, providerId: string): Promise<Result<string[], AppFailure>> {
      const r = forUser(db, userId)
      const p = await r.ai.get(providerId)
      if (!p) return err({ kind: 'not_found' })
      const routed = (await r.ai.routes())
        .filter((x) => x.providerId === providerId)
        .map((x) => x.model)
      return ok([...new Set([...((p.modelsJson as string[]) ?? []), ...routed])].sort())
    },

    prices: (userId: string) => forUser(db, userId).settings.get('ai.prices') as Promise<Prices>,

    async setPrice(
      userId: string,
      model: string,
      price: Price | null,
    ): Promise<Result<Prices, AppFailure>> {
      if (!model || model.length > 200)
        return err({ kind: 'validation', field: 'model', code: 'invalid' })
      const s = forUser(db, userId).settings
      const { [model]: _old, ...rest } = (await s.get('ai.prices')) as Prices
      const cur: Prices = { ...rest }
      if (price !== null) {
        if (![price.in, price.out].every((n) => Number.isFinite(n) && n >= 0 && n <= 100_000))
          return err({ kind: 'validation', field: 'price', code: 'invalid' })
        cur[model] = { in: price.in, out: price.out }
      }
      if (Object.keys(cur).length > 200)
        return err({ kind: 'validation', field: 'price', code: 'limit_reached' })
      await s.setMany({ 'ai.prices': cur })
      return ok(cur)
    },
  }
}
