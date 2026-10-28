import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { actionItems, messages } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { groupActions, tomorrowMorning, type ActionRow } from '../../shared/actions'

const berlin = () => 60
const now = new Date('2026-10-27T07:30:00Z') // Tue 08:30 Berlin
const row = (id: string, o: Partial<ActionRow> = {}): ActionRow => ({
  id,
  messageId: 'm',
  text: id,
  dueAt: null,
  dueText: null,
  status: 'open',
  snoozedUntil: null,
  subject: 's',
  fromName: null,
  fromAddress: 'a@b.test',
  ...o,
})

describe('groupActions', () => {
  it('splits into today/overdue, upcoming, no date, snoozed and done', () => {
    const g = groupActions(
      [
        row('overdue', { dueAt: new Date('2026-10-20T22:59:00Z') }),
        row('today-late', { dueAt: new Date('2026-10-27T22:59:00Z') }),
        row('tomorrow', { dueAt: new Date('2026-10-28T09:00:00Z') }),
        row('text-only', { dueText: 'when you can' }),
        row('none'),
        row('snoozed', {
          status: 'snoozed',
          snoozedUntil: new Date('2026-10-28T07:00:00Z'),
          dueAt: new Date('2026-10-27T10:00:00Z'),
        }),
        row('woke', {
          status: 'snoozed',
          snoozedUntil: new Date('2026-10-27T05:00:00Z'),
          dueAt: new Date('2026-10-27T10:00:00Z'),
        }),
        row('finished', { status: 'done', dueAt: new Date('2026-10-27T10:00:00Z') }),
      ],
      now,
      berlin,
    )
    expect(g.today.map((r) => r.id)).toEqual(['overdue', 'woke', 'today-late'])
    expect(g.upcoming.map((r) => r.id)).toEqual(['tomorrow'])
    expect(g.noDate.map((r) => r.id)).toEqual(['text-only', 'none'])
    expect(g.snoozed.map((r) => r.id)).toEqual(['snoozed'])
    expect(g.done.map((r) => r.id)).toEqual(['finished'])
  })

  it('"today" follows the user time zone, not UTC', () => {
    const lateNight = new Date('2026-10-27T23:30:00Z') // already 28th in Berlin
    const g = groupActions(
      [row('a', { dueAt: new Date('2026-10-28T10:00:00Z') })],
      lateNight,
      berlin,
    )
    expect(g.today).toHaveLength(1)
    expect(
      groupActions([row('a', { dueAt: new Date('2026-10-28T10:00:00Z') })], lateNight, () => 0)
        .upcoming,
    ).toHaveLength(1)
  })

  it('tomorrowMorning is 08:00 local on the next day, across DST changes', () => {
    expect(tomorrowMorning(now, berlin)).toEqual(new Date('2026-10-28T07:00:00Z'))
    const eu = (d: Date) => (d < new Date('2026-10-25T01:00:00Z') ? 120 : 60)
    expect(tomorrowMorning(new Date('2026-10-24T10:00:00Z'), eu)).toEqual(
      new Date('2026-10-25T07:00:00Z'),
    ) // the 25th, 08:00 CET
    expect(tomorrowMorning(new Date('2026-10-27T23:30:00Z'), berlin)).toEqual(
      new Date('2026-10-29T07:00:00Z'),
    )
  })
})

describe('actions repo', () => {
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
    const f = (await r.mail.listFolders(acc.id))[0]!
    const [m] = await db
      .insert(messages)
      .values({
        userId: user.id,
        accountId: acc.id,
        folderId: f.id,
        providerMessageId: 'm1',
        fromAddress: 'alex@acme.example',
        fromName: 'Alex',
        subject: 'Q3',
        sentAt: new Date(),
        receivedAt: new Date(),
      })
      .returning()
    const [a, b] = await db
      .insert(actionItems)
      .values([
        { userId: user.id, messageId: m!.id, itemText: 'Send numbers' },
        {
          userId: user.id,
          messageId: m!.id,
          itemText: 'Book room',
          dueAt: new Date('2026-11-01T10:00:00Z'),
        },
      ])
      .returning()
    return { db, user, other, r, a: a!, b: b! }
  }

  it('lists items with their message context, marks done/reopen and snoozes', async () => {
    const s = await setup()
    expect((await s.r.actions.list()).map((x) => [x.text, x.subject, x.fromName])).toEqual([
      ['Book room', 'Q3', 'Alex'],
      ['Send numbers', 'Q3', 'Alex'],
    ])
    expect(await s.r.actions.setStatus(s.a.id, 'done')).toBe(true)
    expect((await s.r.actions.list()).map((x) => [x.text, x.status])).toEqual([
      ['Book room', 'open'],
      ['Send numbers', 'done'],
    ])
    expect(await s.r.actions.setStatus(s.a.id, 'open')).toBe(true)
    const until = new Date('2026-10-28T07:00:00Z')
    expect(await s.r.actions.snooze(s.b.id, until)).toBe(true)
    expect((await s.r.actions.list()).find((x) => x.id === s.b.id)).toMatchObject({
      status: 'snoozed',
      snoozedUntil: until,
    })
    await s.r.actions.setStatus(s.b.id, 'open')
    expect((await s.r.actions.list()).find((x) => x.id === s.b.id)!.snoozedUntil).toBeNull()
  })

  it('never touches another user’s items', async () => {
    const s = await setup()
    const o = forUser(s.db, s.other.id).actions
    expect(await o.list()).toEqual([])
    expect(await o.setStatus(s.a.id, 'done')).toBe(false)
    expect(await o.snooze(s.a.id, new Date())).toBe(false)
    expect((await s.r.actions.list()).every((x) => x.status === 'open')).toBe(true)
  })
})
