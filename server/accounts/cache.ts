import type { Db } from '../db/client'
import { forUser } from '../repos'

/**
 * "Clear cached mail": removes the local copies (except mail that still has an
 * open task) and resets every account's sync position, so the next check
 * fetches it again. Nothing in the mailbox changes.
 */
export async function clearMailCache(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ removed: number; accounts: number }> {
  const repos = forUser(db, userId)
  const removed = await repos.mail.deleteReceivedBeforeKeepingOpenTasks(now)
  const accounts = await repos.accounts.list()
  for (const a of accounts)
    await repos.accounts.update(a.id, { syncCursor: null, lastSyncAt: null })
  return { removed, accounts: accounts.length }
}
