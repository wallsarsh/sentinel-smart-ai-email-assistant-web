import type { Db } from '../db/client'
import { accountsRepo } from './accounts'
import { mailRepo } from './mail'
import { inTransaction, type Scope } from './scope'

export type { Scope } from './scope'

/**
 * The only way routes and services reach the database: every repository is
 * bound to one user, so a query without a user id cannot be written.
 */
export function forUser(db: Db, userId: string) {
  const scope: Scope = { db, userId }
  return {
    userId,
    accounts: accountsRepo(scope),
    mail: mailRepo(scope),
    transaction: <T>(fn: (tx: ReturnType<typeof forUser>) => Promise<T>) =>
      inTransaction(scope, (tx) => fn(forUser(tx.db, userId))),
  }
}

export type UserRepos = ReturnType<typeof forUser>
