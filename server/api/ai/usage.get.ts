import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Usage for the last N days plus today's totals against the caps. Counts only; never mail content. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const q = z
    .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
    .safeParse(getQuery(event))
  if (!q.success) return failWith(event, { kind: 'validation', field: 'days', code: 'invalid' })
  const r = forUser(useDb(), user.id)
  const now = new Date()
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const since = new Date(startToday.getTime() - (q.data.days - 1) * 86_400_000)
  const [rows, today, caps, prices] = await Promise.all([
    r.ai.usageBreakdown(since),
    r.ai.usageSince(startToday),
    Promise.all([r.settings.get('ai.dailyTokenCap'), r.settings.get('ai.dailyCostCapMicros')]),
    r.settings.get('ai.prices'),
  ])
  return { rows, today, caps: { tokens: caps[0], costMicros: caps[1] }, prices }
})
