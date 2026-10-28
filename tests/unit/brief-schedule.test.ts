import { describe, expect, it } from 'vitest'
import { zoneOffset } from '../../server/ai/prompts/builder'
import { createTestDb } from '../../server/db/client'
import { briefGenerator } from '../../server/brief/generator'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { Deadline } from '../../server/jobs/deadline'
import { err, ok } from '../../shared/errors/result'
import { briefTimeOn, isBriefDue, localDate, nextBriefTime } from '../../shared/brief-schedule'
import { briefStep, defaultBriefPorts, type BriefPorts } from '../../worker/jobs/brief'

const off = (tz: string) => (at: Date) => zoneOffset(tz, at)
const NY = off('America/New_York')
const BERLIN = off('Europe/Berlin')
const iso = (d: Date) => d.toISOString()

describe('brief time in the user time zone', () => {
  it('07:30 local is 11:30Z in NY summer time and 12:30Z in winter', () => {
    expect(iso(briefTimeOn(new Date('2026-07-01T20:00:00Z'), 450, NY))).toBe(
      '2026-07-01T11:30:00.000Z',
    )
    expect(iso(briefTimeOn(new Date('2026-12-01T20:00:00Z'), 450, NY))).toBe(
      '2026-12-01T12:30:00.000Z',
    )
  })

  it('stays at 07:30 local across the spring-forward and fall-back days (NY)', () => {
    // US DST starts 2026-03-08 and ends 2026-11-01.
    expect(iso(briefTimeOn(new Date('2026-03-07T20:00:00Z'), 450, NY))).toBe(
      '2026-03-07T12:30:00.000Z',
    )
    expect(iso(briefTimeOn(new Date('2026-03-08T20:00:00Z'), 450, NY))).toBe(
      '2026-03-08T11:30:00.000Z',
    )
    expect(iso(briefTimeOn(new Date('2026-10-31T20:00:00Z'), 450, NY))).toBe(
      '2026-10-31T11:30:00.000Z',
    )
    expect(iso(briefTimeOn(new Date('2026-11-01T20:00:00Z'), 450, NY))).toBe(
      '2026-11-01T12:30:00.000Z',
    )
  })

  it('next brief time rolls to the next local day, including across a change (Berlin, 2026-03-29)', () => {
    // 07:30 CET = 06:30Z on the 28th; 07:30 CEST = 05:30Z on the 29th.
    const after = new Date('2026-03-28T07:00:00Z')
    expect(iso(nextBriefTime(after, 450, BERLIN))).toBe('2026-03-29T05:30:00.000Z')
    expect(iso(nextBriefTime(new Date('2026-03-28T05:00:00Z'), 450, BERLIN))).toBe(
      '2026-03-28T06:30:00.000Z',
    )
    // exactly at the brief time, the next one is tomorrow's
    expect(iso(nextBriefTime(new Date('2026-03-28T06:30:00Z'), 450, BERLIN))).toBe(
      '2026-03-29T05:30:00.000Z',
    )
  })

  it('a time inside the spring-forward gap lands on a real instant after the gap start', () => {
    // 02:30 local does not exist on 2026-03-08 in NY (02:00 -> 03:00).
    const t = briefTimeOn(new Date('2026-03-08T12:00:00Z'), 150, NY)
    expect(t.getTime()).toBeGreaterThanOrEqual(new Date('2026-03-08T06:30:00Z').getTime())
    expect(t.getTime()).toBeLessThanOrEqual(new Date('2026-03-08T07:30:00Z').getTime())
  })

  it('local date follows the zone, not UTC', () => {
    const t = new Date('2026-10-28T02:00:00Z')
    expect(localDate(t, NY)).toBe('2026-10-27')
    expect(localDate(t, off('Asia/Tokyo'))).toBe('2026-10-28')
  })

  it('is due only after the brief time and when no brief was written since', () => {
    const o = { minutes: 450, offsetAt: NY }
    const at = (s: string) => new Date(s)
    expect(isBriefDue({ ...o, now: at('2026-07-01T11:29:00Z'), lastCreatedAt: null })).toBe(false)
    expect(isBriefDue({ ...o, now: at('2026-07-01T11:31:00Z'), lastCreatedAt: null })).toBe(true)
    expect(
      isBriefDue({
        ...o,
        now: at('2026-07-01T15:00:00Z'),
        lastCreatedAt: at('2026-07-01T11:31:00Z'),
      }),
    ).toBe(false)
    expect(
      isBriefDue({
        ...o,
        now: at('2026-07-01T15:00:00Z'),
        lastCreatedAt: at('2026-06-30T11:31:00Z'),
      }),
    ).toBe(true)
    // a brief written by a manual refresh before the brief time does not count for today
    expect(
      isBriefDue({
        ...o,
        now: at('2026-07-01T15:00:00Z'),
        lastCreatedAt: at('2026-07-01T09:00:00Z'),
      }),
    ).toBe(true)
  })
})

describe('briefStep', () => {
  const NOW = new Date('2026-10-28T12:00:00Z')
  const mk = (over: Partial<BriefPorts> = {}) => {
    const log: string[] = []
    let claimed = false
    const p: BriefPorts = {
      aiEnabled: async () => true,
      isDue: async () => true,
      claim: async () => (claimed ? false : (claimed = true)),
      release: async () => void ((claimed = false), log.push('release')),
      generate: async () => (log.push('generate'), 'brief-1'),
      notifyReady: async (_u, id) => void log.push(`notify:${id}`),
      ...over,
    }
    return { p, log, step: briefStep(p, () => NOW) }
  }
  const dl = (ms = 60_000) => new Deadline(ms)

  it('writes the brief and notifies', async () => {
    const { step, log } = mk()
    expect(await step('u', dl())).toBe(true)
    expect(log).toEqual(['generate', 'notify:brief-1'])
  })

  it.each([
    ['AI off', { aiEnabled: async () => false }],
    ['not due', { isDue: async () => false }],
  ])('does nothing when %s', async (_n, over) => {
    const { step, log } = mk(over)
    expect(await step('u', dl())).toBe(false)
    expect(log).toEqual([])
  })

  it('does nothing without time left for a brief', async () => {
    const { step, log } = mk()
    expect(await step('u', dl(5_000))).toBe(false)
    expect(log).toEqual([])
  })

  it('two runs at once write one brief', async () => {
    const { step, log } = mk()
    const [a, b] = await Promise.all([step('u', dl()), step('u', dl())])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(log.filter((l) => l === 'generate')).toHaveLength(1)
  })

  it('a failed attempt gives the slot back so the next run retries', async () => {
    let n = 0
    const { step, log } = mk({ generate: async () => (n++ === 0 ? null : 'brief-2') })
    expect(await step('u', dl())).toBe(false)
    expect(log).toContain('release')
    expect(await step('u', dl())).toBe(true)
    expect(log).toContain('notify:brief-2')
  })

  it('a throwing generator releases the slot and the error surfaces', async () => {
    const { step, log } = mk({
      generate: async () => {
        throw new Error('boom')
      },
    })
    await expect(step('u', dl())).rejects.toThrow('boom')
    expect(log).toContain('release')
  })

  it('a failing notification does not undo the brief', async () => {
    const { step } = mk({
      notifyReady: async () => {
        throw new Error('push down')
      },
    })
    expect(await step('u', dl())).toBe(true)
  })
})

describe('with the real ports', () => {
  async function setup() {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const repos = forUser(db, user.id)
    await authRepo(db).updateProfile(user.id, { timezone: 'America/New_York' })
    await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
    let calls = 0
    const router = {
      complete: async () => {
        calls++
        return ok({
          text: JSON.stringify({ headline: 'Quiet.', sections: [] }),
          stop: 'end',
          route: { providerId: 'p', model: 'm' },
        } as never)
      },
    }
    const sent: unknown[] = []
    let now = new Date('2026-07-01T10:00:00Z') // 06:00 in NY: before the brief time
    const brief = briefGenerator({ db, router: router as never, now: () => now })
    const ports = defaultBriefPorts({
      db,
      brief,
      push: { send: async (_u, p) => void sent.push(p) },
    })
    const step = briefStep(ports, () => now)
    // a message so that the brief has something to summarise
    return {
      db,
      user,
      repos,
      step,
      sent,
      calls: () => calls,
      at: (s: string) => (now = new Date(s)),
    }
  }

  it('waits for the brief time, writes once per local day, and again the next day', async () => {
    const s = await setup()
    await s.repos.settings.setMany({ 'bg.aiEnabled': true, 'brief.notify': true })
    const dl = () => new Deadline(60_000)
    expect(await s.step(s.user.id, dl())).toBe(false) // 06:00 local
    s.at('2026-07-01T11:45:00Z') // 07:45 local
    expect(await s.step(s.user.id, dl())).toBe(true)
    expect(await s.step(s.user.id, dl())).toBe(false)
    expect(await s.repos.briefs.history()).toHaveLength(1)
    expect(s.sent).toEqual([{ type: 'brief', briefId: (await s.repos.briefs.latest())!.row.id }])
    s.at('2026-07-02T11:45:00Z')
    expect(await s.step(s.user.id, dl())).toBe(true)
    expect(await s.repos.briefs.history()).toHaveLength(2)
  })

  it('does not notify unless the user opted in, and does nothing with background AI off', async () => {
    const s = await setup()
    const dl = () => new Deadline(60_000)
    s.at('2026-07-01T11:45:00Z')
    expect(await s.step(s.user.id, dl())).toBe(false) // bg.aiEnabled defaults to off
    await s.repos.settings.setMany({ 'bg.aiEnabled': true })
    expect(await s.step(s.user.id, dl())).toBe(true)
    expect(s.sent).toEqual([])
  })

  it('a quiet day (no mail to summarise) still gets its brief, without a model call', async () => {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const repos = forUser(db, user.id)
    await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
    await repos.settings.setMany({ 'bg.aiEnabled': true })
    const fail = true
    const router = {
      complete: async () =>
        fail
          ? err({ kind: 'cap_reached' as const, scope: 'tokens' as const })
          : ok({
              text: '{"headline":"ok","sections":[]}',
              stop: 'end',
              route: { providerId: 'p', model: 'm' },
            } as never),
    }
    const now = new Date('2026-07-01T12:00:00Z')
    const folderless = briefGenerator({ db, router: router as never, now: () => now })
    const step = briefStep(defaultBriefPorts({ db, brief: folderless }), () => now)
    // empty window: stores an empty brief without a model call, which is still a brief for the day
    expect(await step(user.id, new Deadline(60_000))).toBe(true)
    expect(await repos.briefs.history()).toHaveLength(1)
  })
})
