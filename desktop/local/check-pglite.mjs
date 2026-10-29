// Runs during packaging, not on end-user machines. Uses the same PGlite
// NodeFS engine that production will use; ensures persisted migrations work.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
const dir = await mkdtemp(join(tmpdir(), 'sentinel-desktop-db-'))
try {
  const pg = new PGlite(join(dir, 'data'))
  await pg.query('create table desktop_probe(id int primary key, name text)')
  await pg.query("insert into desktop_probe(id, name) values (1,'persist')")
  await pg.close()
  const again = new PGlite(join(dir, 'data'))
  const result = await again.query('select name from desktop_probe where id=1')
  if (result.rows[0]?.name !== 'persist') throw new Error('PGlite persistence failed')
  await again.close()
  console.log('PGlite persistence passed')
} finally {
  await rm(dir, { recursive: true, force: true })
}
