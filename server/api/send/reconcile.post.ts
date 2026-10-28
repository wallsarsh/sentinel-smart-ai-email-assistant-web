import { useDb, useSenders } from '../../container'
import { reconcileUnknown } from '../../mail/send/records'
import { requireUser } from '../../utils/require-user'

/** Looks in the Sent folder for sends whose outcome was uncertain. Only searches; never submits. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  return reconcileUnknown({ db: useDb(), reconcilerFor: (type) => useSenders()[type] }, user.id)
})
