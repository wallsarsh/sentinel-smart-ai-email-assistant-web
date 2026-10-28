import { useAccounts } from '../../container'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return { accounts: await useAccounts().list(user.id) }
})
