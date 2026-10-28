import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { aiGateway, Metered } from './gateway'
import type { AiRequest, AiTask } from './types'

export const TASKS: AiTask[] = ['triage', 'brief', 'draft', 'repair', 'default']
export const MAX_CHAIN = 4

export const routeParams = z
  .object({
    maxTokens: z.number().int().min(16).max(32_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()
export type Route = { providerId: string; model: string; params: z.infer<typeof routeParams> }

/** Failures that justify trying the next route: the provider is unavailable or unreachable, not a rule that would apply everywhere. */
export function isRetryable(f: AppFailure): boolean {
  switch (f.kind) {
    case 'network':
    case 'rate_limited':
    case 'auth': // a bad or revoked key on one provider should not stop the chain
      return true
    case 'provider':
      return f.status === null || f.status >= 500 || f.status === 408
    default:
      return false // consent, caps, validation, forbidden, not_found, ai_output …
  }
}

export function aiRouter(d: { db: Db; gateway: Pick<ReturnType<typeof aiGateway>, 'complete'> }) {
  /** Read on every call, so edits apply to the next call without a restart. */
  async function routesFor(userId: string, task: AiTask): Promise<Route[]> {
    const all = await forUser(d.db, userId).ai.routes()
    const pick = (t: AiTask) =>
      all.filter((r) => r.task === t).sort((a, b) => a.position - b.position)
    const rows = pick(task).length ? pick(task) : pick('default')
    return rows.map((r) => ({
      providerId: r.providerId,
      model: r.model,
      params: routeParams.catch({}).parse(r.paramsJson),
    }))
  }

  return {
    routesFor,

    /** Runs [build] against each route in order until one answers or fails non-retryably. */
    async complete(
      userId: string,
      task: AiTask,
      build: (route: Route) => Omit<AiRequest, 'model'>,
    ): Promise<Result<Metered & { route: Route; attempts: number }, AppFailure>> {
      const routes = await routesFor(userId, task)
      if (!routes.length) return err({ kind: 'validation', field: 'route', code: 'no_route' })
      let last: AppFailure = { kind: 'unknown' }
      let attempts = 0
      for (const route of routes) {
        attempts++
        const base = build(route)
        const request: AiRequest = {
          ...base,
          model: route.model,
          maxTokens: route.params.maxTokens ?? base.maxTokens,
          temperature: route.params.temperature ?? base.temperature,
        }
        const r = await d.gateway.complete({ userId, providerId: route.providerId, task, request })
        if (r.ok) return ok({ ...r.value, route, attempts })
        last = r.error
        if (!isRetryable(r.error)) return r
      }
      return err(last)
    },

    async setChain(
      userId: string,
      task: AiTask,
      chain: unknown,
    ): Promise<Result<Route[], AppFailure>> {
      const p = z
        .array(
          z.object({
            providerId: z.uuid(),
            model: z.string().trim().min(1).max(200),
            params: routeParams.default({}),
          }),
        )
        .max(MAX_CHAIN)
        .safeParse(chain)
      if (!p.success || !TASKS.includes(task))
        return err({ kind: 'validation', field: 'routes', code: 'invalid' })
      const repos = forUser(d.db, userId)
      const mine = new Set((await repos.ai.list()).map((x) => x.id))
      if (!p.data.every((c) => mine.has(c.providerId)))
        return err({ kind: 'validation', field: 'routes', code: 'unknown_provider' })
      await repos.ai.setRoutes(
        task,
        p.data.map((c) => ({ providerId: c.providerId, model: c.model, paramsJson: c.params })),
      )
      return ok(await routesFor(userId, task))
    },
  }
}
