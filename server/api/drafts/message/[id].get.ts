import { useDb } from '../../../container'
import { forUser } from '../../../repos'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** Local state of the draft for a message (no body): status and what is needed to open it at the provider. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const repos = forUser(useDb(), user.id)
  const d = await repos.drafts.forMessage(getRouterParam(event, 'id') ?? '')
  if (!d) return failWith(event, { kind: 'not_found' })
  const a = await repos.accounts.get(d.accountId)
  return {
    id: d.id,
    status: d.status,
    providerDraftId: d.providerDraftId,
    updatedAt: d.updatedAt,
    accountType: a?.type ?? 'imap',
    accountEmail: a?.email ?? '',
  }
})
