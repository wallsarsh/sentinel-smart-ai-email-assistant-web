import { z } from 'zod'
import { useAiRouter } from '../../container'
import { TASKS } from '../../ai/router'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = z
    .object({ task: z.enum(TASKS as [string, ...string[]]), chain: z.array(z.unknown()) })
    .safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'routes', code: 'invalid' })
  const r = await useAiRouter().setChain(
    user.id,
    b.data.task as (typeof TASKS)[number],
    b.data.chain,
  )
  return r.ok ? { routes: r.value } : failWith(event, r.error)
})
