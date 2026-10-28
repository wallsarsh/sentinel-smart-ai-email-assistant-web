import type { Db } from '../db/client'
import { forUser } from '../repos'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { computeCost, type Cost, type Prices } from './catalog'
import type { aiProviderService } from './providers'
import {
  AiStreamError,
  type AiRequest,
  type AiResponse,
  type AiTask,
  type StreamEvent,
} from './types'

export type GatewayDeps = {
  db: Db
  providers: Pick<ReturnType<typeof aiProviderService>, 'instance'>
  now?: () => Date
}
export type GatewayCall = { userId: string; providerId: string; task: AiTask; request: AiRequest }
export type Metered = AiResponse & { cost: Cost }

const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/**
 * The only way to reach a model. Every call passes through the same gates:
 * the provider must exist and have the user's consent (read fresh each time,
 * so revoking takes effect at once), the daily token/cost caps must not be
 * used up, and every answer is metered into usage records.
 */
export function aiGateway(d: GatewayDeps) {
  const now = d.now ?? (() => new Date())

  async function gate(c: GatewayCall) {
    const r = forUser(d.db, c.userId)
    const row = await r.ai.get(c.providerId)
    if (!row) return err<AppFailure>({ kind: 'not_found' })
    if (!row.consentGivenAt)
      return err<AppFailure>({ kind: 'consent_required', providerId: row.id })
    const s = r.settings
    const [tokenCap, costCap] = await Promise.all([
      s.get('ai.dailyTokenCap'),
      s.get('ai.dailyCostCapMicros'),
    ])
    if (tokenCap > 0 || costCap > 0) {
      const used = await r.ai.usageSince(startOfUtcDay(now()))
      if (tokenCap > 0 && used.tokens >= tokenCap)
        return err<AppFailure>({ kind: 'cap_reached', scope: 'tokens' })
      if (costCap > 0 && used.costMicros >= costCap)
        return err<AppFailure>({ kind: 'cap_reached', scope: 'cost' })
    }
    const provider = await d.providers.instance(c.userId, row)
    return provider.ok
      ? ok({ provider: provider.value, prices: (await s.get('ai.prices')) as Prices })
      : provider
  }

  async function meter(c: GatewayCall, res: AiResponse, prices: Prices): Promise<Metered> {
    const cost = computeCost(res.usage, prices[c.request.model])
    await forUser(d.db, c.userId).ai.recordUsage({
      providerId: c.providerId,
      model: c.request.model,
      task: c.task,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      cachedTokens: res.usage.cachedTokens,
      costMicros: cost.micros,
      createdAt: now(),
    })
    return { ...res, cost }
  }

  return {
    async complete(c: GatewayCall): Promise<Result<Metered, AppFailure>> {
      const g = await gate(c)
      if (!g.ok) return g
      const res = await g.value.provider.complete(c.request)
      return res.ok ? ok(await meter(c, res.value, g.value.prices)) : res
    },

    /** Same gates; failures surface as AiStreamError before the first delta. Usage is recorded on `done`. */
    async *stream(
      c: GatewayCall,
    ): AsyncGenerator<StreamEvent | { type: 'metered'; cost: Cost }, void, void> {
      const g = await gate(c)
      if (!g.ok) throw new AiStreamError(g.error)
      if (!g.value.provider.stream)
        throw new AiStreamError({ kind: 'validation', field: 'provider', code: 'no_streaming' })
      for await (const ev of g.value.provider.stream(c.request)) {
        yield ev
        if (ev.type === 'done')
          yield { type: 'metered', cost: (await meter(c, ev.response, g.value.prices)).cost }
      }
    },
  }
}
