import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { createTestDb } from '../../server/db/client'
import { users } from '../../server/db/schema'
import { forUser } from '../../server/repos'

let t: Awaited<ReturnType<typeof createTestDb>>
let alice: string
let bob: string
beforeAll(async () => {
  t = await createTestDb()
  const [a, b] = await t.db
    .insert(users)
    .values([
      { email: 'alice@x.test', passwordHash: 'h' },
      { email: 'bob@x.test', passwordHash: 'h' },
    ])
    .returning()
  alice = a!.id
  bob = b!.id
})
afterAll(async () => t.close())

const msg = (accountId: string, folderId: string, pid: string) => ({
  accountId,
  folderId,
  providerMessageId: pid,
  fromAddress: 'c@x.test',
  sentAt: new Date(),
  receivedAt: new Date(),
  subject: 's',
})

describe('tenant scoping', () => {
  it("a user cannot read, change or delete another user's rows", async () => {
    const A = forUser(t.db, alice)
    const B = forUser(t.db, bob)
    const acc = await A.accounts.create({
      type: 'gmail',
      email: 'alice@gmail.test',
      displayName: 'A',
    })
    await A.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
    const [folder] = await A.mail.listFolders(acc.id)
    await A.mail.upsertMessages([msg(acc.id, folder!.id, 'm1')])
    const [m] = await A.mail.recent()

    expect(await B.accounts.list()).toEqual([])
    expect(await B.accounts.get(acc.id)).toBeNull()
    expect(await B.accounts.update(acc.id, { displayName: 'hacked' })).toBeNull()
    expect(await B.accounts.remove(acc.id)).toBe(false)
    expect(await B.mail.getMessage(m!.id)).toBeNull()
    expect(await B.mail.setRead(m!.id, true)).toBe(false)
    expect(await B.mail.recent()).toEqual([])
    expect(await B.mail.listFolders(acc.id)).toEqual([])
    expect(await B.mail.deleteByProviderIds(acc.id, ['m1'])).toBe(0)

    expect((await A.accounts.get(acc.id))?.displayName).toBe('A')
    expect(await A.mail.getMessage(m!.id)).not.toBeNull()
  })

  it("writes into another user's account are refused", async () => {
    const A = forUser(t.db, alice)
    const B = forUser(t.db, bob)
    const acc = await A.accounts.create({ type: 'imap', email: 'a2@x.test', displayName: 'A2' })
    await expect(B.mail.upsertFolders(acc.id, [{ providerId: 'X', name: 'X' }])).rejects.toThrow(
      'forbidden',
    )
    await expect(B.mail.upsertThread(acc.id, 't', 's', new Date())).rejects.toThrow('forbidden')
    await expect(
      B.mail.upsertMessages([msg(acc.id, '00000000-0000-0000-0000-000000000000', 'x')]),
    ).rejects.toThrow('forbidden')
  })

  it('transactions roll back and stay scoped', async () => {
    const A = forUser(t.db, alice)
    const before = (await A.accounts.list()).length
    await expect(
      A.transaction(async (tx) => {
        await tx.accounts.create({ type: 'imap', email: 'rollback@x.test', displayName: 'R' })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect((await A.accounts.list()).length).toBe(before)
    await A.transaction(async (tx) => {
      await tx.accounts.create({ type: 'imap', email: 'kept@x.test', displayName: 'K' })
    })
    expect((await A.accounts.list()).length).toBe(before + 1)
  })
})

describe('architecture', () => {
  it('only repositories, db and tests touch the schema tables', () => {
    const out = execSync(
      'grep -rln "db/schema" server app shared worker --include=*.ts --include=*.vue 2>/dev/null || true',
      { encoding: 'utf8' },
    )
    const offenders = out
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.startsWith('server/repos/') && !f.startsWith('server/db/'))
    expect(offenders).toEqual([])
  })
})
