import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

/** Real Postgres connection (server and worker). */
export function createDb(databaseUrl: string): { db: Db; close: () => Promise<void> } {
  if (databaseUrl === 'pglite:local') {
    const dataDir = process.env.SENTINEL_DESKTOP_DB_DIR
    if (!dataDir) throw new Error('SENTINEL_DESKTOP_DB_DIR is required for local PGlite')
    const raw = new PGlite(dataDir)
    return { db: drizzlePglite(raw, { schema }), close: () => raw.close() }
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 10 })
  // The two drivers share the query API; the cast keeps one `Db` type.
  const db = drizzlePg(pool, { schema }) as unknown as Db
  return { db, close: () => pool.end() }
}

export async function migrateDb(databaseUrl: string): Promise<void> {
  if (databaseUrl === 'pglite:local') {
    const dataDir = process.env.SENTINEL_DESKTOP_DB_DIR
    if (!dataDir) throw new Error('SENTINEL_DESKTOP_DB_DIR is required for local PGlite')
    const raw = new PGlite(dataDir)
    try {
      await migratePglite(drizzlePglite(raw, { schema }), { migrationsFolder })
    } finally {
      await raw.close()
    }
    return
  }
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
