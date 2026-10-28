import { isPhone } from './redactor'

export type ForeignDetail = {
  kind: 'link' | 'email' | 'phone'
  value: string
  start: number
  end: number
}

const LINK = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /(?<![\w@.])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d[\d ()./-]{6,17}\d(?![\w@])/g
const digits = (s: string) => s.replace(/\D/g, '')
const norm = (s: string) => s.toLowerCase().replace(/[.,;:!?)]+$/, '')

/**
 * Finds links, email addresses and phone numbers in [draft] that do not
 * appear in [known] (the thread and the user's own details). The model must
 * not invent these (draft prompt rule), so each one is shown to the user as
 * something to check before sending.
 */
export function scanForeignDetails(draft: string, known: string[]): ForeignDetail[] {
  const pool = known.join('\n')
  const poolLower = pool.toLowerCase()
  const poolDigits = digits(pool)
  const out: ForeignDetail[] = []
  const take = (re: RegExp, kind: ForeignDetail['kind'], seen: (v: string) => boolean) => {
    for (const m of draft.matchAll(re)) {
      const value = kind === 'link' ? m[0].replace(/[.,;:!?]+$/, '') : m[0]
      if (!seen(value)) out.push({ kind, value, start: m.index!, end: m.index! + value.length })
    }
  }
  take(LINK, 'link', (v) => poolLower.includes(norm(v)))
  take(EMAIL, 'email', (v) => poolLower.includes(v.toLowerCase()))
  take(PHONE, 'phone', (v) => !isPhone(v) || poolDigits.includes(digits(v)))
  // A link containing an address (mailto-like) is reported once.
  return out
    .filter(
      (d, i) =>
        !(
          d.kind === 'email' &&
          out.some((o, j) => j !== i && o.kind === 'link' && o.start <= d.start && o.end >= d.end)
        ),
    )
    .sort((a, b) => a.start - b.start)
}

export const PLACEHOLDER = /\[[^\]\n]{2,60}\]/g
/** `[confirm date]`-style placeholders still in the text. */
export const placeholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map((m) => m[0])

export type Segment = { text: string; kind: 'text' | 'placeholder' | 'link' | 'email' | 'phone' }

/** Splits [text] into plain and flagged parts for display (placeholders and foreign details). */
export function highlightSegments(text: string, known: string[]): Segment[] {
  const marks: { start: number; end: number; kind: Segment['kind'] }[] = [
    ...scanForeignDetails(text, known).map((d) => ({ start: d.start, end: d.end, kind: d.kind })),
    ...[...text.matchAll(PLACEHOLDER)].map((m) => ({
      start: m.index!,
      end: m.index! + m[0].length,
      kind: 'placeholder' as const,
    })),
  ].sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let at = 0
  for (const m of marks) {
    if (m.start < at) continue // overlapping: the earlier mark wins
    if (m.start > at) out.push({ text: text.slice(at, m.start), kind: 'text' })
    out.push({ text: text.slice(m.start, m.end), kind: m.kind })
    at = m.end
  }
  if (at < text.length) out.push({ text: text.slice(at), kind: 'text' })
  return out
}
