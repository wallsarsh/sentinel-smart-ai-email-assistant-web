import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { randomBytes } from 'node:crypto'
import { createTestDb } from '../../server/db/client'
import { authService } from '../../server/auth/service'
import { accountLifecycle } from '../../server/account/lifecycle'
import { forUser } from '../../server/repos'
import { secretStoreFor } from '../../server/security/secret-store'
import { users, accounts, messages, settings, secrets, sessions } from '../../server/db/schema'

let t: Awaited<ReturnType<typeof createTestDb>>
let uid: string
let other: string
const PW = 'correct horse battery staple'
const ring = { current: { version: 1, key: randomBytes(32) } }

beforeAll(async () => {
  t = await createTestDb()
  const svc = authService({
    db: t.db,
    baseUrl: 'https://a.test',
    mailer: { sendPasswordReset: async () => {} },
  })
  uid = ((await svc.signup({ email: 'e@x.test', password: PW })) as { value: { userId: string } })
    .value.userId
  other = ((await svc.signup({ email: 'o@x.test', password: PW })) as { value: { userId: string } })
    .value.userId
  const repo = forUser(t.db, uid)
  const acc = await repo.accounts.create({ type: 'imap', email: 'e@mail.test', displayName: 'E' })
  await repo.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
  const [f] = await repo.mail.listFolders(acc.id)
  await repo.mail.upsertMessages([
    {
      accountId: acc.id,
      folderId: f!.id,
      providerMessageId: '1',
      fromAddress: 'c@x.test',
      subject: 'Hello',
      sentAt: new Date(),
      receivedAt: new Date(),
    },
  ])
  await repo.settings.setMany({ 'send.undoSeconds': 9 })
  await secretStoreFor(t.db, uid, ring).put('imap.password', 'super-secret-mail-password')
  await forUser(t.db, other).accounts.create({
    type: 'gmail',
    email: 'o@gmail.test',
    displayName: 'O',
  })
})
afterAll(async () => t.close())

describe('export', () => {
  it('contains the user data and never credentials', async () => {
    const { bytes, filename } = await accountLifecycle({ db: t.db }).exportData(uid)
    expect(filename).toMatch(/^sentinel-export-\d{4}-\d{2}-\d{2}\.zip$/)
    const files = unzipSync(bytes)
    const text = Object.values(files).map(strFromU8).join('\n')
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'README.txt',
        'users.json',
        'accounts.json',
        'messages.json',
        'settings.json',
      ]),
    )
    expect(text).toContain('Hello')
    expect(text).toContain('e@mail.test')
    expect(text).not.toMatch(/argon2|password_hash|passwordHash|super-secret|ciphertext/)
    expect(Object.keys(files)).not.toContain('secrets.json')
    expect(Object.keys(files)).not.toContain('sessions.json')
  })

  it("never includes another user's rows", async () => {
    const files = unzipSync((await accountLifecycle({ db: t.db }).exportData(uid)).bytes)
    expect(strFromU8(files['accounts.json']!)).not.toContain('o@gmail.test')
  })
})

describe('deletion', () => {
  it('needs the right password', async () => {
    const r = await accountLifecycle({ db: t.db }).deleteAccount(uid, 'not the password')
    expect(r.ok).toBe(false)
    expect(await t.db.select().from(users)).toHaveLength(2)
  })

  it('removes everything the user owns, revokes grants, leaves others alone', async () => {
    const revoked: string[] = []
    const life = accountLifecycle({
      db: t.db,
      revokers: [
        { name: 'google', revoke: async (id) => void revoked.push(id) },
        {
          name: 'broken',
          revoke: async () => {
            throw new Error('down')
          },
        },
      ],
    })
    const r = await life.deleteAccount(uid, PW)
    expect(r).toEqual({ ok: true, value: { revocationFailures: ['broken'] } })
    expect(revoked).toEqual([uid])
    for (const tbl of [accounts, messages, settings, secrets, sessions]) {
      const rows = (await t.db.select().from(tbl)) as { userId: string }[]
      expect(
        rows.some((x) => x.userId === uid),
        String(tbl),
      ).toBe(false)
    }
    expect((await t.db.select().from(users)).map((u) => u.id)).toEqual([other])
    expect(await forUser(t.db, other).accounts.list()).toHaveLength(1)
  })
})
