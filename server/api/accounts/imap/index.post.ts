import { useAccounts, useAuditor } from '../../../container'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const r = await useAccounts().addImap(user.id, await readBody(event))
  if (!r.ok) return failWith(event, r.error)
  await useAuditor().record(user.id, 'account_connected', `new:imap:${r.value.id}`)
  setResponseStatus(event, 201)
  return r.value
})
