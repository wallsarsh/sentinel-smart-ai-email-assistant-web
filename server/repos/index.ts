import type { Db } from '../db/client'
import { accountsRepo } from './accounts'
import { auditRepo } from './audit'
import { exportRepo } from './export'
import { inboxRepo } from './inbox'
import { mailRepo } from './mail'
import { mfaRepo } from './mfa'
import { searchRepo } from './search'
import { secretsRepo } from './secrets'
import { settingsRepo } from './settings'
import { inTransaction, type Scope } from './scope'

export type { Scope } from './scope'

export type UserRepos = {
  userId: string
  accounts: ReturnType<typeof accountsRepo>
  mail: ReturnType<typeof mailRepo>
  inbox: ReturnType<typeof inboxRepo>
  search: ReturnType<typeof searchRepo>
  secrets: ReturnType<typeof secretsRepo>
  mfa: ReturnType<typeof mfaRepo>
  audit: ReturnType<typeof auditRepo>
  settings: ReturnType<typeof settingsRepo>
  data: ReturnType<typeof exportRepo>
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
    inbox: inboxRepo(scope),
    search: searchRepo(scope),
    secrets: secretsRepo(scope),
    mfa: mfaRepo(scope),
    audit: auditRepo(scope),
    settings: settingsRepo(scope),
    data: exportRepo(scope),
    transaction: (fn) => inTransaction(scope, (tx) => fn(forUser(tx.db, userId))),
  }
}
