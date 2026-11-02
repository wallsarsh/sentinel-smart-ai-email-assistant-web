// Calendar candidates and ICS export. Thunderbird's calendar API is still an experiment, so the safe path is
// a standards-compliant .ics file the user opens or imports explicitly.
const DAY = 24 * 3600_000

const clip = (s, n) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}
const pad = (n) => String(n).padStart(2, '0')
const dateOnly = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const compactDate = (s) => s.replace(/-/g, '')
const compactUtc = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))

/** Validates one model/action event. Returns null for anything without a usable start. */
export function normalizeEvent(raw) {
  if (!raw) return null
  const title = clip(raw.title, 140)
  const startIn = String(raw.start ?? '').trim()
  if (!title || !startIn) return null
  const allDay = raw.allDay === true || isDate(startIn)
  const start = allDay ? startIn.slice(0, 10) : new Date(startIn)
  if (allDay ? !isDate(start) : !Number.isFinite(start.getTime())) return null
  let end = null
  if (raw.end) {
    const e = allDay ? String(raw.end).slice(0, 10) : new Date(raw.end)
    if (allDay ? isDate(e) : Number.isFinite(e.getTime())) end = allDay ? e : e.toISOString()
  }
  return {
    title,
    start: allDay ? start : start.toISOString(),
    end,
    allDay,
    location: raw.location ? clip(raw.location, 120) : null,
    description: raw.description ? clip(raw.description, 500) : null,
    sourceMessageId: raw.sourceMessageId ?? null,
  }
}

/**
 * Calendar candidates for a message: explicit events first; if there are none, dated action items become
 * all-day reminders. Undated actions are deliberately not invented into events.
 */
export function eventsFromAnalysis(analysis, { header = null } = {}) {
  const out = []
  const seen = new Set()
  const add = (e) => {
    const key = `${e.title.toLowerCase()}|${e.start}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(e)
  }
  for (const raw of analysis?.calendarEvents ?? []) {
    const e = normalizeEvent({ ...raw, sourceMessageId: header?.headerMessageId ?? null })
    if (e) add(e)
  }
  for (const a of analysis?.actionItems ?? []) {
    if (!a?.dueDate || !isDate(a.dueDate)) continue
    const e = normalizeEvent({
      title: a.text,
      start: a.dueDate,
      allDay: true,
      description: analysis.summary ?? '',
      location: null,
      sourceMessageId: header?.headerMessageId ?? null,
    })
    if (e) add(e)
  }
  return out.slice(0, 5)
}

const escape = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
const fold = (line) => {
  if (line.length <= 75) return line
  let out = line.slice(0, 75)
  let rest = line.slice(75)
  while (rest.length) {
    out += `\r\n ${rest.slice(0, 74)}`
    rest = rest.slice(74)
  }
  return out
}
const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
export const uidFor = (event) =>
  `${hash(`${event.title}|${event.start}|${event.sourceMessageId ?? ''}`)}@sentinel.local`

/** Serialises events to RFC 5545. Timed events become UTC instants; date-only items stay all-day. */
export function toIcs(events, { now = new Date(), prodId = '-//Sentinel//AI Email Assistant//EN' } = {}) {
  const stamp = compactUtc(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const event of events) {
    const start = event.start
    let dtstart
    let dtend
    if (event.allDay) {
      dtstart = `DTSTART;VALUE=DATE:${compactDate(start)}`
      const end = event.end && isDate(event.end) ? event.end : dateOnly(new Date(Date.parse(`${start}T00:00:00Z`) + DAY))
      dtend = `DTEND;VALUE=DATE:${compactDate(end)}`
    } else {
      const s = new Date(start)
      const e = event.end ? new Date(event.end) : new Date(s.getTime() + 3600_000)
      dtstart = `DTSTART:${compactUtc(s)}`
      dtend = `DTEND:${compactUtc(e)}`
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidFor(event)}`,
      `DTSTAMP:${stamp}`,
      dtstart,
      dtend,
      `SUMMARY:${escape(event.title)}`,
      ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
      ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export const icsFilename = (now = new Date()) => `sentinel-${dateOnly(now)}.ics`

/**
 * Downloads an ICS. `downloads` is the browser.downloads API (injected for tests).
 * This is only called from an explicit user action.
 */
export async function downloadIcs(events, { downloads, now = new Date(), filename } = {}) {
  if (!events?.length) throw new Error('There is no calendar item to add.')
  if (!downloads?.download || typeof URL?.createObjectURL !== 'function')
    throw new Error('This Thunderbird build cannot save calendar files.')
  const blob = new Blob([toIcs(events, { now })], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    await downloads.download({ url, filename: filename ?? icsFilename(now), saveAs: true })
    return { filename: filename ?? icsFilename(now) }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
