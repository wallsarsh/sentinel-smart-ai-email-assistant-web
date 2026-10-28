import { z } from 'zod'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const body = z.object({
  kind: z.enum(['vip', 'mute']),
  pattern: z.string().max(200),
  accountId: z.uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = body.safeParse(await readBody(event))
  if (!b.success) return failWith(event, { kind: 'validation', field: 'rule', code: 'invalid' })
  const repos = forUser(useDb(), user.id)
  if (b.data.accountId && !(await repos.accounts.get(b.data.accountId)))
    return failWith(event, { kind: 'not_found' })
  if (!(await repos.rules.add(b.data.kind, b.data.pattern, b.data.accountId ?? null)))
    return failWith(event, { kind: 'validation', field: 'pattern', code: 'invalid' })
  setResponseStatus(event, 201)
  return { ok: true }
})
