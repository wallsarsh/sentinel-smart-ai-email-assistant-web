import { useAccounts } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const r = await useAccounts().testImap(await readBody(event))
  return r.ok ? { ok: true } : failWith(event, r.error)
})
