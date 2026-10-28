// The backup / restore / key-rotation drill, run for real: pg_dump a populated database, restore it into a new one,
// compare every table, read an encrypted secret back with the same KEK, then rotate the KEK. The timings it prints
// are the numbers recorded in the task log and the runbook.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { secretStoreFor, type KekRing } from '../../server/security/secret-store'
import { DATABASE_URL, resetDatabase } from '../e2e/harness'

const URL_BASE = DATABASE_URL.replace(/\/[^/]+$/, '')
const SRC = DATABASE_URL
const DST = `${URL_BASE}/sentinel_restore`
const N = 20_000
const times: Record<string, number> = {}

const ringV1: KekRing = { current: { version: 1, key: randomBytes(32) } }
let db: Db
let close: () => Promise<void>
let backupDir: string
let dump = ''
let userId = ''

const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } })

async function counts(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const tables = (
    await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    )
  ).rows.map((r) => r.table_name as string)
  const out: Record<string, number> = {}
  for (const t of tables)
    out[t] = Number((await pool.query(`select count(*) from "${t}"`)).rows[0].count)
  await pool.end()
  return out
}

beforeAll(async () => {
  await resetDatabase()
  ;({ db, close } = createDb(SRC))
  backupDir = mkdtempSync(join(tmpdir(), 'backups-'))
  const user = await authRepo(db).createUser({ email: 'drill@x.test', passwordHash: 'h' })
  userId = user.id
  const repos = forUser(db, userId)
  const acc = await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
  await repos.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const [folder] = await repos.mail.listFolders(acc.id)
  await db.execute(sql`
    insert into messages (user_id, account_id, folder_id, provider_message_id, from_address, subject, body_text, sent_at, received_at)
    select ${userId}, ${acc.id}, ${folder!.id}, 'p' || g, 's' || (g % 50) || '@x.test', 'Subject ' || g, repeat('body ', 40), now(), now() - (g || ' minutes')::interval
    from generate_series(1, ${N}) g`)
  await repos.settings.setMany({ 'bg.intervalMinutes': 30, 'retention.days': 7 })
  await secretStoreFor(db, userId, ringV1).put('imap:password', 'hunter2-the-real-one')
}, 120_000)

afterAll(async () => {
  await close?.()
  console.log('restore drill timings (s)', JSON.stringify(times), `messages=${N}`)
})

describe('backup', () => {
  it('writes a verified dump with a checksum', () => {
    const t = performance.now()
    const r = sh('bash', ['deploy/backup.sh'], { DATABASE_URL: SRC, BACKUP_DIR: backupDir })
    times.backup = Math.round((performance.now() - t) / 100) / 10
    expect(r.status, r.stderr).toBe(0)
    dump = r.stdout.trim().split('\n').at(-1)!
    expect(dump).toMatch(/sentinel-\d{8}T\d{6}Z(-\d+)?\.dump$/)
    expect(existsSync(dump)).toBe(true)
    expect(existsSync(`${dump}.sha256`)).toBe(true)
    expect(readdirSync(backupDir).some((f) => f.endsWith('.partial'))).toBe(false)
  })

  it('keeps the newest dump but removes ones older than the retention period', () => {
    const old = join(backupDir, 'sentinel-20200101T000000Z.dump')
    writeFileSync(old, 'x')
    writeFileSync(`${old}.sha256`, 'x')
    const longAgo = new Date(Date.now() - 40 * 86_400_000)
    utimesSync(old, longAgo, longAgo)
    utimesSync(`${old}.sha256`, longAgo, longAgo)
    const r = sh('bash', ['deploy/backup.sh'], {
      DATABASE_URL: SRC,
      BACKUP_DIR: backupDir,
      BACKUP_KEEP_DAYS: '14',
    })
    expect(r.status, r.stderr).toBe(0)
    const files = readdirSync(backupDir)
    expect(files).not.toContain('sentinel-20200101T000000Z.dump')
    expect(files.filter((f) => f.endsWith('.dump')).length).toBeGreaterThanOrEqual(2)
  })

  it('fails loudly without a database URL', () => {
    expect(sh('bash', ['deploy/backup.sh'], { DATABASE_URL: '' }).status).not.toBe(0)
  })
})

describe('restore', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: `${URL_BASE}/postgres`, max: 1 })
    await admin.query('drop database if exists sentinel_restore')
    await admin.query('create database sentinel_restore')
    await admin.end()
  })

  it('refuses without the database name as confirmation, and changes nothing', async () => {
    const r = sh('bash', ['deploy/restore.sh', dump, DST])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('CONFIRM_RESTORE=sentinel_restore')
    expect(await counts(DST)).toEqual({})
    const wrong = sh('bash', ['deploy/restore.sh', dump, DST], { CONFIRM_RESTORE: 'sentinel_e2e' })
    expect(wrong.status).toBe(2)
  })

  it('refuses a dump whose checksum does not match', () => {
    const bad = join(backupDir, 'tampered.dump')
    writeFileSync(bad, 'not a dump')
    writeFileSync(`${bad}.sha256`, `${'0'.repeat(64)}  tampered.dump\n`)
    const r = sh('bash', ['deploy/restore.sh', bad, DST], { CONFIRM_RESTORE: 'sentinel_restore' })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toMatch(/FAILED|checksum/i)
  })

  it('restores every table with identical row counts', async () => {
    const t = performance.now()
    const r = sh('bash', ['deploy/restore.sh', dump, DST], { CONFIRM_RESTORE: 'sentinel_restore' })
    times.restore = Math.round((performance.now() - t) / 100) / 10
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/restored into sentinel_restore: \d+ tables, \d+ migrations recorded/)
    const [a, b] = [await counts(SRC), await counts(DST)]
    expect(b).toEqual(a)
    expect(b.messages).toBe(N)
  })

  it('the restored database serves the same data and the same KEK opens the secret; a different KEK cannot', async () => {
    const { db: restored, close: closeRestored } = createDb(DST)
    try {
      expect((await forUser(restored, userId).settings.all())['bg.intervalMinutes']).toBe(30)
      expect(await secretStoreFor(restored, userId, ringV1).get('imap:password')).toBe(
        'hunter2-the-real-one',
      )
      await expect(
        secretStoreFor(restored, userId, { current: { version: 1, key: randomBytes(32) } }).get(
          'imap:password',
        ),
      ).rejects.toThrow()
    } finally {
      await closeRestored()
    }
  })

  it('restoring over a populated database replaces it (clean restore, repeatable)', () => {
    const again = sh('bash', ['deploy/restore.sh', dump, DST], {
      CONFIRM_RESTORE: 'sentinel_restore',
    })
    expect(again.status, again.stderr).toBe(0)
  })
})

describe('KEK rotation', () => {
  const newKey = randomBytes(32)
  const env = (o: Record<string, string>) => ({
    DATABASE_URL: DST,
    BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'drill-session-secret-0123456789abcdef0123456789',
    ...o,
  })
  const rotate = (o: Record<string, string>) =>
    sh('npx', ['tsx', 'server/db/rotate-kek.ts'], env(o))

  it('without the old key listed, rotation fails safely and changes nothing', async () => {
    const r = rotate({ KEK_BASE64: newKey.toString('base64'), KEK_VERSION: '2' })
    expect(r.status).not.toBe(0)
    const { db: d, close: c } = createDb(DST)
    expect(await secretStoreFor(d, userId, ringV1).get('imap:password')).toBe(
      'hunter2-the-real-one',
    )
    await c()
  })

  it('with the old key listed, data keys move to the new KEK, secrets still read, and a second run does nothing', async () => {
    const t = performance.now()
    const env2 = {
      KEK_BASE64: newKey.toString('base64'),
      KEK_VERSION: '2',
      KEK_PREVIOUS: `1:${ringV1.current.key.toString('base64')}`,
    }
    const r = rotate(env2)
    times.rotate = Math.round((performance.now() - t) / 100) / 10
    expect(r.status, r.stderr + r.stdout).toBe(0)
    expect(r.stdout).toContain(
      'Re-wrapped 1 data key(s) under KEK version 2. Keys still on another version: 0.',
    )
    expect(rotate(env2).stdout).toContain('Re-wrapped 0 data key(s)')

    const { db: d, close: c } = createDb(DST)
    const ringV2: KekRing = { current: { version: 2, key: newKey } }
    expect(await secretStoreFor(d, userId, ringV2).get('imap:password')).toBe(
      'hunter2-the-real-one',
    ) // old key no longer needed
    expect(
      await secretStoreFor(d, userId, ringV1)
        .get('imap:password')
        .catch(() => 'cannot'),
    ).toBe('cannot')
    await c()
  })

  it('the configuration refuses a malformed or duplicated key list without printing keys', () => {
    for (const prev of [
      '1:notbase64!!',
      'x',
      `2:${randomBytes(16).toString('base64')}`,
      `2:${newKey.toString('base64')}`,
    ]) {
      const r = rotate({
        KEK_BASE64: newKey.toString('base64'),
        KEK_VERSION: '2',
        KEK_PREVIOUS: prev,
      })
      expect(r.status).not.toBe(0)
      expect(r.stderr + r.stdout).not.toContain(newKey.toString('base64'))
    }
  })
})
