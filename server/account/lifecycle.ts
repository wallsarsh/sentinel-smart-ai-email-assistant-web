import { zipSync, strToU8 } from 'fflate'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { verifyPassword } from '../security/password'
import { authRepo } from '../repos/auth'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { Auditor } from '../audit/audit'

/** Revokes provider grants for one user (Google/Microsoft tokens, AI keys do not need it). Best effort. */
export type TokenRevoker = { name: string; revoke(userId: string): Promise<void> }

export type LifecycleDeps = {
  db: Db
  revokers?: TokenRevoker[]
  auditor?: Auditor
  now?: () => Date
}

const README = `Sentinel data export

Each file is one table of your data as JSON. Passwords, sessions, two-factor
secrets, API keys and mail account credentials are never included.
`

export function accountLifecycle(d: LifecycleDeps) {
  const now = d.now ?? (() => new Date())
  return {
    /** A ZIP of the user's data (no secrets), one JSON file per table. */
    async exportData(userId: string): Promise<{ filename: string; bytes: Uint8Array }> {
      const data = await forUser(d.db, userId).data.collect()
      const files: Record<string, Uint8Array> = { 'README.txt': strToU8(README) }
      for (const [table, rows] of Object.entries(data))
        files[`${table}.json`] = strToU8(JSON.stringify(rows, null, 2))
      await d.auditor?.record(userId, 'data_exported')
      return {
        filename: `sentinel-export-${now().toISOString().slice(0, 10)}.zip`,
        bytes: zipSync(files),
      }
    },

    /**
     * Deletes the account and everything it owns. Needs the password (step-up for
     * two-factor users is checked by the route). Provider grants are revoked first;
     * a failing revoker is reported but never blocks deletion.
     */
    async deleteAccount(
      userId: string,
      password: string,
    ): Promise<Result<{ revocationFailures: string[] }, AppFailure>> {
      const user = await authRepo(d.db).userById(userId)
      if (!user || !(await verifyPassword(user.passwordHash, password)))
        return err({ kind: 'auth', problem: 'invalid_credentials' })
      const failures: string[] = []
      for (const r of d.revokers ?? []) {
        try {
          await r.revoke(userId)
        } catch {
          failures.push(r.name)
        }
      }
      await forUser(d.db, userId).data.deleteUser()
      return ok({ revocationFailures: failures })
    },
  }
}
