import { eq, getTableName, getTableColumns, is, type SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../db/schema'
import { users } from '../db/schema'
import type { Scope } from './scope'

/** Tables that hold credentials or ciphertext: never exported. */
const EXCLUDED = new Set([
  'secrets',
  'data_keys',
  'sessions',
  'mfa_secrets',
  'recovery_codes',
  'password_resets',
])
const COLUMN_EXCLUDED: Record<string, string[]> = {}

function tenantTables(): PgTable[] {
  const out: PgTable[] = []
  for (const v of Object.values(schema) as unknown[]) {
    if (typeof v !== 'object' || v === null || !is(v as never, PgTable)) continue
    const table = v as PgTable
    if ('userId' in getTableColumns(table) && !EXCLUDED.has(getTableName(table))) out.push(table)
  }
  return out
}

export const exportRepo = (s: Scope) => ({
  /** Every row the user owns, by table name, without credentials or ciphertext. */
  async collect(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {}
    const [u] = await s.db.select().from(users).where(eq(users.id, s.userId))
    if (u) {
      const { passwordHash: _p, failedLogins: _f, lockedUntil: _l, ...safe } = u
      void [_p, _f, _l]
      out.users = [safe]
    }
    for (const table of tenantTables()) {
      const name = getTableName(table)
      const userIdCol = getTableColumns(table).userId!
      const rows = (await s.db
        .select()
        .from(table)
        .where(eq(userIdCol, s.userId) as SQL)) as Record<string, unknown>[]
      const drop = COLUMN_EXCLUDED[name] ?? []
      out[name] = rows.map((r) =>
        Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))),
      )
    }
    return out
  },

  async deleteUser() {
    await s.db.delete(users).where(eq(users.id, s.userId))
  },
})
