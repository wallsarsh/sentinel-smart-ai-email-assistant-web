import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { Pool } from 'pg'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>
const migrationsFolder = new URL('./migrations', import.meta.url).pathname

/** Real Postgres connection (server and worker). */
export function createDb(databaseUrl: string): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 })
  // The two drivers share the query API; the cast keeps one `Db` type.
  const db = drizzlePg(pool, { schema }) as unknown as Db
  return { db, close: () => pool.end() }
}

export async function migrateDb(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await migratePg(drizzlePg(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}

/** In-process Postgres (PGlite) with all migrations applied, for tests. */
export async function createTestDb(): Promise<{ db: Db; raw: PGlite; close: () => Promise<void> }> {
  const raw = new PGlite()
  const db = drizzlePglite(raw, { schema })
  await migratePglite(db, { migrationsFolder })
  return { db, raw, close: () => raw.close() }
}
