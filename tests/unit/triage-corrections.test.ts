import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { messages, triageResults } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { triageCorrections } from '../../server/triage/corrections'

async function setup() {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const r = forUser(db, user.id)
  const acc = await r.accounts.create({
    type: 'imap',
    email: 'a@x.test',
    displayName: '',
    color: 1,
  })
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const folder = (await r.mail.listFolders(acc.id))[0]!
  const [m] = await db
    .insert(messages)
    .values({
      userId: user.id,
      accountId: acc.id,
      folderId: folder.id,
      providerMessageId: 'm1',
      fromAddress: 'News@Vendor.example',
      sentAt: new Date(),
      receivedAt: new Date(),
    })
    .returning()
  await db.insert(triageResults).values({
    messageId: m!.id,
    userId: user.id,
    category: 'other',
    importance: 'low',
    urgency: 'urgent',
    priority: 'p3_this_week',
    needsReply: false,
    summary: 's',
    reason: 'r',
    source: 'ai',
  })
  return { db, user, other, r, m: m!, svc: triageCorrections(db) }
}

describe('triage corrections', () => {
  it('importance change recomputes priority, marks the user as source and is remembered for the sender', async () => {
    const s = await setup()
    expect(await s.svc.correct(s.user.id, s.m.id, { importance: 'high' })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await s.r.triage.resultFor(s.m.id)).toMatchObject({
      importance: 'high',
      priority: 'p1_do_now',
      source: 'user',
    })
    expect(await s.r.rules.correctionFor('news@vendor.example')).toBe('high')
    expect(await s.r.rules.hints()).toEqual(['news@vendor.example → user marks High importance'])
  })
  it('needs-reply change is for this message only (no sender rule)', async () => {
    const s = await setup()
    await s.svc.correct(s.user.id, s.m.id, { needsReply: true })
    expect(await s.r.triage.resultFor(s.m.id)).toMatchObject({
      needsReply: true,
      source: 'user',
      importance: 'low',
    })
    expect(await s.r.rules.hints()).toEqual([])
  })
  it('validates input and per-user ownership', async () => {
    const s = await setup()
    expect(await s.svc.correct(s.user.id, s.m.id, {})).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    })
    expect(await s.svc.correct(s.user.id, s.m.id, { importance: 'urgent' })).toMatchObject({
      ok: false,
    })
    expect(await s.svc.correct(s.other.id, s.m.id, { importance: 'high' })).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(
      await s.svc.correct(s.user.id, '00000000-0000-0000-0000-000000000000', {
        importance: 'high',
      }),
    ).toEqual({ ok: false, error: { kind: 'not_found' } })
    expect((await s.r.triage.resultFor(s.m.id))!.importance).toBe('low')
  })
})
