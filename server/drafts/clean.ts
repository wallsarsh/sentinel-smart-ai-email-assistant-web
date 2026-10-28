/**
 * Tidies model output into a reply body: removes code fences, a leading
 * "Subject:" line and anything after a "-- " signature delimiter (the app adds
 * the user's signature itself).
 */
import { isPhone } from '../../shared/redactor'

export function cleanDraft(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n').trim()
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(t)
  if (fence) t = fence[1]!.trim()
  t = t.replace(/^(?:subject|betreff|objet|asunto)\s*:.*\n+/i, '')
  const sig = t.search(/\n-- ?\n/)
  if (sig >= 0) t = t.slice(0, sig)
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

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
