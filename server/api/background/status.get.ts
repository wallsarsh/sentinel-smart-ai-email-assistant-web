import { useDb } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

/** Diagnostics for the background settings page: the last runs and each account's sync state. Metadata only. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const repos = forUser(useDb(), user.id)
  const [runs, accounts] = await Promise.all([
    repos.background.recentRuns(10),
    repos.accounts.list(),
  ])
  return {
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      outcome: r.outcome,
      newMessages: r.newMessages,
      triaged: r.triaged,
      errorCode: r.errorCode,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      status: a.status,
      lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    })),
  }
})
