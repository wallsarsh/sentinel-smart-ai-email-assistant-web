import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { sendRecords } from '../../server/db/schema'
import { reconcileUnknown, sendRecorder, TRANSITIONS } from '../../server/mail/send/records'
import type { SendStatus } from '../../server/repos/dispatch'
import { sendFixture } from './helpers'

const STATES = Object.keys(TRANSITIONS) as SendStatus[]

describe('send record state machine', () => {
  it('has exactly the documented legal moves', () => {
    expect(TRANSITIONS).toEqual({
      pending: ['submitting', 'failed', 'cancelled'],
      submitting: ['sent', 'failed', 'unknown'],
      unknown: ['sent', 'failed'],
      sent: [],
      failed: [],
      cancelled: [],
    })
  })

  it('stores metadata only: no column can hold a body, subject or address list', () => {
    expect(Object.keys(getTableColumns(sendRecords)).sort()).toEqual([
      'accountId',
      'approvedAt',
      'contentHash',
      'draftRefId',
      'errorCode',
      'id',
      'internetMessageId',
      'recipientCount',
      'sentAt',
      'status',
      'userId',
    ])
  })

  it('refuses every move that is not in the table (all 6x6 combinations)', async () => {
    const f = await sendFixture('gmail')
    const rec = sendRecorder(f.db)
    const methods: Record<SendStatus, (id: string) => Promise<boolean>> = {
      pending: async () => false,
      submitting: (id) => rec.submitting(f.user.id, id),
      sent: (id) => rec.sent(f.user.id, id),
      failed: (id) => rec.failed(f.user.id, id, 'x'),
      unknown: (id) => rec.unknown(f.user.id, id),
      cancelled: (id) => rec.cancelled(f.user.id, id),
    }
    const reach: Record<SendStatus, SendStatus[]> = {
      pending: [],
      submitting: ['submitting'],
      unknown: ['submitting', 'unknown'],
      sent: ['submitting', 'sent'],
      failed: ['failed'],
      cancelled: ['cancelled'],
    }
    for (const from of STATES) {
      for (const to of STATES.filter((s) => s !== 'pending')) {
        const r = await rec.begin(f.user.id, f.content, {
          internetMessageId: '<m@x>',
          contentHash: 'h',
        })
        for (const step of reach[from]) await methods[step]!(r.id)
        expect((await rec.get(f.user.id, r.id))!.status, `setup ${from}`).toBe(from)
        const moved = await methods[to]!(r.id)
        expect(moved, `${from} → ${to}`).toBe(TRANSITIONS[from].includes(to))
        expect((await rec.get(f.user.id, r.id))!.status).toBe(moved ? to : from)
      }
    }
  })

  it('records the send time on sent and an error code on failure', async () => {
    const f = await sendFixture('gmail')
    const rec = sendRecorder(f.db, () => new Date('2026-10-28T12:00:00Z'))
    const a = await rec.begin(f.user.id, f.content, {
      internetMessageId: '<a@x>',
      contentHash: 'h',
    })
    await rec.submitting(f.user.id, a.id)
    await rec.sent(f.user.id, a.id)
    expect(await rec.get(f.user.id, a.id)).toMatchObject({
      status: 'sent',
      sentAt: new Date('2026-10-28T12:00:00Z'),
      recipientCount: 1,
    })
    const b = await rec.begin(f.user.id, f.content, {
      internetMessageId: '<b@x>',
      contentHash: 'h',
    })
    await rec.failed(f.user.id, b.id, 'smtp_550')
    expect(await rec.get(f.user.id, b.id)).toMatchObject({
      status: 'failed',
      errorCode: 'smtp_550',
      sentAt: null,
    })
  })

  it("another user's records are untouchable", async () => {
    const f = await sendFixture('gmail')
    const rec = sendRecorder(f.db)
    const a = await rec.begin(f.user.id, f.content, {
      internetMessageId: '<a@x>',
      contentHash: 'h',
    })
    expect(await rec.submitting('00000000-0000-4000-8000-000000000000', a.id)).toBe(false)
    expect((await rec.get(f.user.id, a.id))!.status).toBe('pending')
  })
})

describe('reconcileUnknown', () => {
  it('only searches: settles found sends, leaves the rest unknown, and never calls send', async () => {
    const f = await sendFixture('gmail')
    const rec = sendRecorder(f.db)
    const mk = async (id: string, to: 'unknown' | 'sent' | 'failed') => {
      const r = await rec.begin(f.user.id, f.content, { internetMessageId: id, contentHash: 'h' })
      await rec.submitting(f.user.id, r.id)
      if (to === 'unknown') await rec.unknown(f.user.id, r.id)
      else if (to === 'sent') await rec.sent(f.user.id, r.id)
      else await rec.failed(f.user.id, r.id, 'x')
      return r.id
    }
    const found = await mk('<found@x>', 'unknown')
    const missing = await mk('<missing@x>', 'unknown')
    await mk('<done@x>', 'sent')
    await mk('<bad@x>', 'failed')
    const searched: string[] = []
    const calls: string[] = []
    const reconciler = {
      reconcile: async (_u: string, id: string) => {
        calls.push('reconcile')
        searched.push(id)
        if (id === found) await rec.sent(f.user.id, id)
        return { ok: true as const, value: id === found }
      },
      send: async () => {
        calls.push('SEND')
        throw new Error('must not send')
      },
    }
    const out = await reconcileUnknown(
      { db: f.db, reconcilerFor: () => reconciler as never },
      f.user.id,
    )
    expect(out).toEqual({ checked: 2, found: 1 })
    expect(searched.sort()).toEqual([found, missing].sort())
    expect(calls.every((c) => c === 'reconcile')).toBe(true)
    expect((await rec.get(f.user.id, found))!.status).toBe('sent')
    expect((await rec.get(f.user.id, missing))!.status).toBe('unknown')
    expect(
      await reconcileUnknown({ db: f.db, reconcilerFor: () => reconciler as never }, f.user.id),
    ).toEqual({ checked: 1, found: 0 })
  })
})
