export type CatchUpPreset = 'threeHours' | 'today' | 'threeDays' | 'week'
export const CATCH_UP_PRESETS: CatchUpPreset[] = ['threeHours', 'today', 'threeDays', 'week']

const H = 3_600_000
const MAX_DAYS = 90

/** Start of the range for a quick choice, ending at [now]. "today" means since local midnight. */
export function presetStart(p: CatchUpPreset, now: Date): Date {
  switch (p) {
    case 'threeHours':
      return new Date(now.getTime() - 3 * H)
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case 'threeDays':
      return new Date(now.getTime() - 72 * H)
    case 'week':
      return new Date(now.getTime() - 168 * H)
  }
}

/** A range is usable when it starts before it ends, ends no later than now and starts within 90 days. */
export function validRange(from: Date, to: Date, now: Date): boolean {
  return (
    Number.isFinite(from.getTime()) &&
    Number.isFinite(to.getTime()) &&
    from < to &&
    to.getTime() <= now.getTime() + 60_000 &&
    from.getTime() >= now.getTime() - MAX_DAYS * 24 * H
  )
}

/** `<input type="datetime-local">` value (local time, minutes). */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => new Date(v)

export const BRIEF_STALE_MS = 24 * H
export const isStale = (createdAt: string, now: Date) =>
  now.getTime() - new Date(createdAt).getTime() > BRIEF_STALE_MS
