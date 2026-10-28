/** Minutes after midnight → `HH:MM` for `<input type="time">`. */
export function minutesToTime(m: number): string {
  const c = Math.min(1439, Math.max(0, Math.round(m)))
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}

/** `HH:MM` → minutes after midnight, or null when it is not a valid time. */
export function timeToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}
