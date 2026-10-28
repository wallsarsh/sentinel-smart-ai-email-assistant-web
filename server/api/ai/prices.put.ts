import { z } from 'zod'
import { useCatalog } from '../../container'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const body = z.object({
  model: z.string().min(1).max(200),
  price: z.object({ in: z.number(), out: z.number() }).nullable(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = body.safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'price', code: 'invalid' })
  const r = await useCatalog().setPrice(user.id, b.data.model, b.data.price)
  return r.ok ? { prices: r.value } : failWith(event, r.error)
})
