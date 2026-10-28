import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  )

describe('read state', () => {
  it('routes under server/api/messages never import mail providers, OAuth or send code', () => {
    for (const f of walk('server/api/messages')) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/mail\/(gmail|graph|imap|oauth|send|provider)/) // mail/mime is pure formatting
      // The container is only for the database handle.
      const names = [...src.matchAll(/import \{([^}]*)\} from '[./]*container'/g)].flatMap((m) =>
        m[1]!.split(',').map((x) => x.trim()),
      )
      expect(
        names.filter((n) => n && n !== 'useDb' && n !== 'useCorrections'),
        f,
      ).toEqual([])
    }
    expect(walk('server/api/messages').length).toBeGreaterThan(0)
  })

  it('marks read/unread for the owner only and returns threads in order', async () => {
    const { db } = await createTestDb()
    const u = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const o = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    const r = forUser(db, u.id)
    const acc = await r.accounts.create({
      type: 'imap',
      email: 'a@x.test',
      displayName: '',
      color: 1,
    })
    await r.mail.upsertFolders(acc.id, [
      { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
    ])
    const f = (await r.mail.listFolders(acc.id))[0]!
    const t = await r.mail.upsertThread(acc.id, 't1', 'S', new Date())
    const mk = (id: string, ms: number) =>
      db
        .insert(messages)
        .values({
          userId: u.id,
          accountId: acc.id,
          folderId: f.id,
          threadId: t.id,
          providerMessageId: id,
          fromAddress: 'a@b.test',
          sentAt: new Date(ms),
          receivedAt: new Date(ms),
        })
        .returning()
    const [b] = await mk('b', 2000)
    const [a] = await mk('a', 1000)
    expect(await r.mail.setRead(a!.id, true)).toBe(true)
    expect((await r.mail.getMessage(a!.id))!.isRead).toBe(true)
    expect(await r.mail.setRead(a!.id, false)).toBe(true)
    expect(await forUser(db, o.id).mail.setRead(a!.id, true)).toBe(false)
    expect((await r.mail.threadMessages(t.id)).map((m) => m.id)).toEqual([a!.id, b!.id])
    expect(await forUser(db, o.id).mail.getMessage(a!.id)).toBeNull()
  })
})
