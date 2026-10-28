import { useDb } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

/** The sent log: metadata only (when, which account, how many recipients, outcome). Never message content. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const repos = forUser(useDb(), user.id)
  const accounts = new Map((await repos.accounts.list()).map((a) => [a.id, a.email]))
  const rows = await repos.send.recentRecords(50)
  return {
    records: rows.map((r) => ({
      id: r.id,
      account: accounts.get(r.accountId) ?? '',
      status: r.status,
      approvedAt: r.approvedAt,
      sentAt: r.sentAt,
      recipientCount: r.recipientCount,
      errorCode: r.errorCode,
    })),
  }
})
