import type { Db } from '../db/client'

/** What every repository receives: the database and the one user it may touch. */
export type Scope = { readonly db: Db; readonly userId: string }

/** Runs [fn] in a transaction with a scope bound to the same user. */
export async function inTransaction<T>(scope: Scope, fn: (tx: Scope) => Promise<T>): Promise<T> {
  return scope.db.transaction((tx) => fn({ db: tx as unknown as Db, userId: scope.userId }))
}
