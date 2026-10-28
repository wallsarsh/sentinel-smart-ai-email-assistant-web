export type RedactionOptions = {
  cards: boolean
  ibans: boolean
  phones: boolean
  otherEmails: boolean
}
export const defaultRedaction: RedactionOptions = {
  cards: true,
  ibans: true,
  phones: true,
  otherEmails: true,
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const CARD = /(?<![\w+])\d(?:[ -]?\d){12,18}(?![\w])/g
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{3,4}){3,8}(?:[ ]?[A-Z0-9]{1,3})?\b/g
const PHONE = /(?<![\w@.])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d[\d ()./-]{6,17}\d(?![\w@])/g
const DATE_LIKE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/

/** Luhn checksum over a digit string (13 to 19 digits). */
export function isValidLuhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (alt) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

/** IBAN mod-97 validation (spaces allowed). */
export function isValidIban(iban: string): boolean {
  const s = iban.replace(/ /g, '').toUpperCase()
  if (s.length < 15 || s.length > 34) return false
  const r = s.slice(4) + s.slice(0, 4)
  let rem = 0
  for (const ch of r) {
    const c = ch.charCodeAt(0)
    if (c >= 48 && c <= 57) rem = (rem * 10 + (c - 48)) % 97
    else if (c >= 65 && c <= 90) rem = (rem * 100 + (c - 55)) % 97
    else return false
  }
  return rem === 1
}

export function isPhone(s: string): boolean {
  const t = s.trim()
  if (DATE_LIKE.test(t)) return false
  const digits = t.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  if (t.startsWith('+') || t.startsWith('(')) return true
  // Bare numbers need the shape of a phone number; dots look like decimals or versions.
  return digits.length >= 10 && !t.includes('.') && /[ -]/.test(t)
}

/**
 * Replaces obvious personal data with `[redacted-…]` tags. Validation
 * (Luhn, IBAN mod 97, digit counts) keeps false positives low. Addresses in
 * [keepEmails] (the people in the thread) are preserved so the model can
 * still address them.
 */
export function redact(
  text: string,
  options: RedactionOptions = defaultRedaction,
  keepEmails: Iterable<string> = [],
): string {
  let out = text
  if (options.otherEmails) {
    const keep = new Set([...keepEmails].map((e) => e.toLowerCase()))
    out = out.replace(EMAIL, (m) => (keep.has(m.toLowerCase()) ? m : '[redacted-email]'))
  }
  if (options.ibans) out = out.replace(IBAN, (m) => (isValidIban(m) ? '[redacted-iban]' : m))
  if (options.cards)
    out = out.replace(CARD, (m) => (isValidLuhn(m.replace(/[ -]/g, '')) ? '[redacted-card]' : m))
  if (options.phones) out = out.replace(PHONE, (m) => (isPhone(m) ? '[redacted-phone]' : m))
  return out
}
