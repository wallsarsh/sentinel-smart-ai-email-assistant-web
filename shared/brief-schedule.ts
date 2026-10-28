/**
 * When the daily brief is due (FR-SUM-02), in the user's time zone. The zone
 * is passed as [offsetAt] (minutes east of UTC at an instant), so the same
 * code runs on the server and in tests, and DST is handled by the zone data.
 */
export type OffsetAt = (at: Date) => number

const MIN = 60_000

/** The instant that is [minutes] after local midnight on the local calendar day [y, m, d] (m is 0-based). */
function atLocal(y: number, m: number, d: number, minutes: number, offsetAt: OffsetAt): Date {
  const wall = Date.UTC(y, m, d) + minutes * MIN
  // The offset depends on the instant, which depends on the offset: two passes settle it on either side of a change.
  let t = new Date(wall - offsetAt(new Date(wall)) * MIN)
  t = new Date(wall - offsetAt(t) * MIN)
  return t
}

const localDay = (now: Date, offsetAt: OffsetAt) => {
  const l = new Date(now.getTime() + offsetAt(now) * MIN)
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate() }
}

/** The local calendar date of [now] as `YYYY-MM-DD`. */
export function localDate(now: Date, offsetAt: OffsetAt): string {
  const { y, m, d } = localDay(now, offsetAt)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** The brief time on the local day of [now]. */
export function briefTimeOn(now: Date, minutes: number, offsetAt: OffsetAt): Date {
  const { y, m, d } = localDay(now, offsetAt)
  return atLocal(y, m, d, minutes, offsetAt)
}

/** The first brief time strictly after [now]. */
export function nextBriefTime(now: Date, minutes: number, offsetAt: OffsetAt): Date {
  const today = briefTimeOn(now, minutes, offsetAt)
  if (today > now) return today
  const { y, m, d } = localDay(now, offsetAt)
  return atLocal(y, m, d + 1, minutes, offsetAt)
}

/** Today's brief is missing: the brief time has passed and the newest brief is older than it. */
export function isBriefDue(o: {
  now: Date
  minutes: number
  lastCreatedAt: Date | null
  offsetAt: OffsetAt
}): boolean {
  const scheduled = briefTimeOn(o.now, o.minutes, o.offsetAt)
  if (o.now < scheduled) return false
  return o.lastCreatedAt === null || o.lastCreatedAt < scheduled
}
