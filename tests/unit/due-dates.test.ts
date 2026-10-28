import { describe, expect, it } from 'vitest'
import { zoneOffset } from '../../server/ai/prompts/builder'
import { dueDateResolver } from '../../server/triage/due-dates'

// Berlin in late October 2026: UTC+1 (DST ended 25 Oct).
const berlin = dueDateResolver({ offsetAt: () => 60 })
const utc = dueDateResolver({ offsetAt: () => 0 })
// Tuesday 27 Oct 2026, 08:14 Berlin == 07:14 UTC.
const tue = new Date('2026-10-27T07:14:00Z')
/** Berlin wall time → UTC instant. */
const at = (d: number, h: number, m = 0, month = 10) =>
  new Date(Date.UTC(2026, month - 1, d, h - 1, m))
const phrase = (p: string, emailDate = tue, r = berlin) => r.resolve({ emailDate, phrase: p })

describe('ISO dates', () => {
  it("become the end of the user's day", () =>
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-10-30' })).toEqual({
      at: at(30, 23, 59),
      text: null,
    }))
  it('far past or far future are kept as text', () => {
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-08-01' }).text).toBe('2026-08-01')
    expect(berlin.resolve({ emailDate: tue, isoDate: '2028-01-01' }).at).toBeNull()
  })
  it('30 days back and 365 days ahead are accepted, one more is not', () => {
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-09-27' }).at).not.toBeNull()
    expect(berlin.resolve({ emailDate: tue, isoDate: '2027-10-27' }).at).not.toBeNull()
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-09-26' }).at).toBeNull()
    expect(berlin.resolve({ emailDate: tue, isoDate: '2027-10-28' }).at).toBeNull()
  })
  it('invalid dates fall back to the phrase, else the raw string', () => {
    expect(
      berlin.resolve({ emailDate: tue, isoDate: '2026-02-31', phrase: 'by Friday' }).text,
    ).toBe('by Friday')
    expect(berlin.resolve({ emailDate: tue, isoDate: 'tomorrow' }).text).toBe('tomorrow')
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-13-01' }).at).toBeNull()
  })
  it('past deadlines within range are kept (overdue)', () =>
    expect(berlin.resolve({ emailDate: tue, isoDate: '2026-10-20' }).at).toEqual(at(20, 23, 59)))
  it('the time zone decides the local date of the email', () => {
    const late = new Date('2026-10-27T23:30:00Z') // already the 28th in Berlin
    expect(phrase('today', late).at).toEqual(at(28, 17))
    expect(phrase('today', late, utc).at).toEqual(new Date('2026-10-27T17:00:00Z'))
  })
})

describe('phrases', () => {
  it.each([
    ['today', 17],
    ['Tonight', 21],
    ['by EOD', 17],
    ['COB please', 17],
    ['end of day', 17],
  ])('%s', (p, h) => expect(phrase(p).at).toEqual(at(27, h)))
  it('tomorrow', () => expect(phrase('tomorrow morning').at).toEqual(at(28, 17)))
  it('weekday names resolve to the next occurrence (same day = today)', () => {
    expect(phrase('by Friday').at).toEqual(at(30, 17))
    expect(phrase('Thu').at).toEqual(at(29, 17))
    expect(phrase('Tuesday').at).toEqual(at(27, 17))
    expect(phrase('Monday').at).toEqual(at(2, 17, 0, 11))
  })
  it('"next Friday" is the Friday of the following week', () =>
    expect(phrase('next Friday').at).toEqual(at(6, 17, 0, 11)))
  it('next week, end of week, end of month', () => {
    expect(phrase('next week').at).toEqual(at(6, 17, 0, 11))
    expect(phrase('end of the week').at).toEqual(at(30, 17))
    expect(phrase('end of month').at).toEqual(at(31, 17))
  })
  it('relative offsets', () => {
    expect(phrase('in 3 days').at).toEqual(at(30, 17))
    expect(phrase('in two weeks').at).toEqual(at(10, 17, 0, 11))
    expect(phrase('in 2 hours').at).toEqual(new Date(tue.getTime() + 2 * 3_600_000))
  })
  it('unknown phrases stay text; empty input is empty', () => {
    expect(phrase('when you get a chance').text).toBe('when you get a chance')
    expect(berlin.resolve({ emailDate: tue })).toEqual({ at: null, text: null })
    expect(phrase('  ')).toEqual({ at: null, text: null })
  })
  it('on a Saturday, end of week is today', () =>
    expect(phrase('eow', new Date('2026-10-31T10:00:00Z')).at).toEqual(at(31, 17)))
})

describe('daylight saving time', () => {
  const real = dueDateResolver({ offsetAt: (d) => zoneOffset('Europe/Berlin', d) })
  it('a deadline after the clocks go back uses the new offset', () => {
    // Sat 24 Oct (CEST, +2) → Mon 26 Oct (CET, +1): 17:00 local is 16:00 UTC.
    expect(
      real.resolve({ emailDate: new Date('2026-10-23T10:00:00Z'), phrase: 'Monday' }).at,
    ).toEqual(new Date('2026-10-26T16:00:00Z'))
    expect(
      real.resolve({ emailDate: new Date('2026-10-23T10:00:00Z'), phrase: 'Friday' }).at,
    ).toEqual(new Date('2026-10-23T15:00:00Z'))
  })
  it('spring forward: 23:59 on a 30-hour-offset-change day is still the right wall time', () => {
    // 29 Mar 2026 02:00 CET → 03:00 CEST. End of the 29th is 23:59 CEST = 21:59 UTC.
    expect(
      real.resolve({ emailDate: new Date('2026-03-27T10:00:00Z'), isoDate: '2026-03-29' }).at,
    ).toEqual(new Date('2026-03-29T21:59:00Z'))
  })
  it('works for zones with half-hour and negative offsets', () => {
    const kolkata = dueDateResolver({ offsetAt: (d) => zoneOffset('Asia/Kolkata', d) })
    expect(
      kolkata.resolve({ emailDate: new Date('2026-10-27T05:00:00Z'), phrase: 'today' }).at,
    ).toEqual(new Date('2026-10-27T11:30:00Z'))
    const ny = dueDateResolver({ offsetAt: (d) => zoneOffset('America/New_York', d) })
    expect(ny.resolve({ emailDate: new Date('2026-10-27T15:00:00Z'), phrase: 'today' }).at).toEqual(
      new Date('2026-10-27T21:00:00Z'),
    )
  })
})
