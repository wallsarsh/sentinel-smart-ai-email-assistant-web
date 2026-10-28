export type ResolvedDue = { at: Date | null; text: string | null }
/** UTC offset in minutes of the user's zone at an instant. */
export type OffsetAt = (utc: Date) => number

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
}
const DAY = 86_400_000
/** ISO weekday, Monday = 1 … Sunday = 7, of a date held as UTC midnight. */
const isoDay = (d: Date) => d.getUTCDay() || 7
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)

/**
 * Turns the model's due information into a deadline. Everything is computed on
 * the user's local calendar, so "Friday" means the user's Friday. ISO dates
 * more than 30 days before or 365 days after the email are not trusted and
 * stay as text, as do invalid dates (2026-02-31) and unknown phrases.
 */
export function dueDateResolver(o: { offsetAt: OffsetAt; eodHour?: number }) {
  const eodHour = o.eodHour ?? 17

  /** Calendar date (UTC midnight used as a pure date) of an instant in the user's zone. */
  const localDate = (instant: Date) => {
    const l = new Date(instant.getTime() + o.offsetAt(instant) * 60_000)
    return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()))
  }
  /** Instant for a local wall-clock time on [date]; the offset is taken at the target, so DST changes are respected. */
  const local = (date: Date, hour: number, minute = 0) => {
    const wall = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute),
    )
    const guess = new Date(wall.getTime() - o.offsetAt(wall) * 60_000)
    return new Date(wall.getTime() - o.offsetAt(guess) * 60_000)
  }
  const atEod = (day: Date) => local(day, eodHour)

  function parseIso(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    if (!m) return null
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const date = new Date(Date.UTC(y, mo - 1, d))
    return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null
  }

  const weekdayIn = (p: string) => {
    for (const m of p.matchAll(/[a-z]+/g)) {
      const d = WEEKDAYS[m[0]]
      if (d) return d
    }
    return null
  }

  function fromPhrase(p: string, emailDate: Date): Date | null {
    const today = localDate(emailDate)
    if (/\b(tonight|today)\b/.test(p))
      return p.includes('tonight') ? local(today, 21) : atEod(today)
    if (/\b(eod|cob|end of (the )?day|close of business)\b/.test(p)) return atEod(today)
    if (p.includes('tomorrow')) return atEod(addDays(today, 1))
    const rel = /\bin (\d{1,3}|a|an|one|two|three) (hour|day|week)s?\b/.exec(p)
    if (rel) {
      const n = { a: 1, an: 1, one: 1, two: 2, three: 3 }[rel[1]!] ?? Number(rel[1])
      if (rel[2] === 'hour') return new Date(emailDate.getTime() + n * 3_600_000)
      return atEod(addDays(today, rel[2] === 'day' ? n : 7 * n))
    }
    if (/\b(end of (the )?month|eom)\b/.test(p))
      return atEod(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)))
    if (/\b(end of (the )?week|eow)\b/.test(p)) {
      const wd = isoDay(today)
      return atEod(wd > 5 ? today : addDays(today, (5 - wd + 7) % 7))
    }
    if (/\bnext week\b/.test(p) && !weekdayIn(p))
      return atEod(addDays(today, 8 - isoDay(today) + 4)) // Friday of next week
    const wd = weekdayIn(p)
    if (wd !== null) {
      let ahead = (wd - isoDay(today) + 7) % 7
      if (p.includes('next ') && ahead < 7) ahead = 8 - isoDay(today) + (wd - 1) // the following week's day
      return atEod(addDays(today, ahead))
    }
    return null
  }

  return {
    /** Resolves [isoDate] (YYYY-MM-DD, from the model) or, failing that, [phrase] relative to [emailDate]. */
    resolve(i: { emailDate: Date; isoDate?: string | null; phrase?: string | null }): ResolvedDue {
      const iso = i.isoDate?.trim()
      const phrase = i.phrase?.trim()
      if (iso) {
        const parsed = parseIso(iso)
        if (parsed) {
          const delta = Math.round((parsed.getTime() - localDate(i.emailDate).getTime()) / DAY)
          if (delta >= -30 && delta <= 365) return { at: local(parsed, 23, 59), text: null }
        }
        return { at: null, text: phrase || iso } // out of range or unparsable: keep what the model said
      }
      if (!phrase) return { at: null, text: null }
      const at = fromPhrase(phrase.toLowerCase(), i.emailDate)
      return at ? { at, text: null } : { at: null, text: phrase }
    },
  }
}
