import type { Db } from '../db/client'
import { accountsRepo } from './accounts'
import { mailRepo } from './mail'
import { mfaRepo } from './mfa'
import { secretsRepo } from './secrets'
import { inTransaction, type Scope } from './scope'

export type { Scope } from './scope'

export type UserRepos = {
  userId: string
  accounts: ReturnType<typeof accountsRepo>
  mail: ReturnType<typeof mailRepo>
  secrets: ReturnType<typeof secretsRepo>
  mfa: ReturnType<typeof mfaRepo>
  transaction<T>(fn: (tx: UserRepos) => Promise<T>): Promise<T>
}

/**
 * The only way routes and services reach the database: every repository is
 * bound to one user, so a query without a user id cannot be written.
 */
export function forUser(db: Db, userId: string): UserRepos {
  const scope: Scope = { db, userId }
  return {
    userId,
    accounts: accountsRepo(scope),
    mail: mailRepo(scope),
    secrets: secretsRepo(scope),
    mfa: mfaRepo(scope),
    transaction: (fn) => inTransaction(scope, (tx) => fn(forUser(tx.db, userId))),
  }
}
