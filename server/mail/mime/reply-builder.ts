import { randomBytes } from 'node:crypto'
import type { EmailAddress, MailMessage } from '../../../shared/domain'
import type { ReplyMode } from '../provider'

const REPLY_PREFIX = /^\s*(?:(?:re|aw|antw|sv|vs|odp|res|rv|ref)(?:\[\d+\])?\s*:\s*)+/i

/** `Re: <subject>` without stacking prefixes (`Re: RE: AW: x` becomes `Re: x`). */
export function replySubject(original: string): string {
  const base = original.replace(REPLY_PREFIX, '').trim()
  return base ? `Re: ${base}` : 'Re:'
}

/** Recipients of a reply with the user's own addresses removed; only thread participants. */
export function replyRecipients(input: {
  original: MailMessage
  selfAddresses: Iterable<string>
  mode: ReplyMode
}): { to: EmailAddress[]; cc: EmailAddress[] } {
  const self = new Set([...input.selfAddresses].map((a) => a.trim().toLowerCase()))
  const seen = new Set<string>()
  const unique = (list: EmailAddress[]) =>
    list.filter((a) => {
      const k = a.address.trim().toLowerCase()
      if (self.has(k) || seen.has(k)) return false
      seen.add(k)
      return true
    })
  const { original } = input
  // Replying to our own message goes back to its recipients.
  const fromIsSelf = self.has(original.from.address.trim().toLowerCase())
  const to = unique(fromIsSelf ? original.to : [original.from])
  if (input.mode === 'reply') return { to, cc: [] }
  return { to, cc: unique([...(fromIsSelf ? [] : original.to), ...original.cc]) }
}

/** The original's reference chain plus its own id, de-duplicated; first and last ten when long. */
export function replyReferences(original: MailMessage): string[] {
  const ids: string[] = []
  for (const raw of [...original.references, original.internetMessageId]) {
    const id = raw.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids.length > 11 ? [ids[0]!, ...ids.slice(-10)] : ids
}

/** `<stamp.random@domain>` using the sender's domain. */
export function newMessageId(
  fromAddress: string,
  now = new Date(),
  rand: (n: number) => Buffer = randomBytes,
): string {
  const at = fromAddress.lastIndexOf('@')
  const domain =
    at >= 0 && at < fromAddress.length - 1 ? fromAddress.slice(at + 1) : 'sentinel.invalid'
  return `<${now.getTime().toString(36)}.${rand(10).toString('hex')}@${domain}>`
}

/** Deterministic Message-ID from an idempotency key, so a retried save finds its own draft. */
export const draftMessageId = (key: string, fromAddress: string) => {
  const at = fromAddress.lastIndexOf('@')
  const domain =
    at >= 0 && at < fromAddress.length - 1 ? fromAddress.slice(at + 1) : 'sentinel.invalid'
  return `<sentinel-${key.replace(/[^A-Za-z0-9._-]/g, '')}@${domain}>`
}

// ---- RFC 5322 / 2047 rendering ------------------------------------------------

const ASCII = /^[\x20-\x7e]*$/

/** RFC 2047 encoded-words (B encoding, UTF-8), split so no word exceeds 75 characters. */
export function encodeWord(text: string): string {
  if (ASCII.test(text)) return text
  const words: string[] = []
  let cur = ''
  for (const ch of text) {
    // 45 bytes of UTF-8 -> 60 base64 chars; with "=?UTF-8?B?" and "?=" that stays under 75.
    if (Buffer.byteLength(cur + ch) > 45) {
      words.push(cur)
      cur = ''
    }
    cur += ch
  }
  if (cur) words.push(cur)
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ')
}

function formatAddress(a: EmailAddress): string {
  if (!a.name?.trim()) return a.address
  const name = a.name.replace(/[\r\n]/g, ' ').trim()
  if (!ASCII.test(name)) return `${encodeWord(name)} <${a.address}>`
  return /[()<>@,;:\\".[\]]/.test(name)
    ? `"${name.replace(/(["\\])/g, '\\$1')}" <${a.address}>`
    : `${name} <${a.address}>`
}

/** Folds a header at 76 characters on whitespace. */
function fold(name: string, value: string): string {
  const line = `${name}: ${value}`
  if (line.length <= 76 || line.includes('\r\n')) return line
  const parts = line.split(' ')
  const out: string[] = []
  let cur = parts[0]!
  for (const p of parts.slice(1)) {
    if ((cur + ' ' + p).length > 76) {
      out.push(cur)
      cur = ' ' + p
    } else cur += ' ' + p
  }
  out.push(cur)
  return out.join('\r\n')
}

const rfc2822Date = (d: Date) => d.toUTCString().replace('GMT', '+0000')
const noCrlf = (s: string) => s.replace(/[\r\n]+/g, ' ')

/** Quoted-printable (UTF-8) with soft line breaks at 76 characters. */
function quotedPrintable(text: string): string {
  const bytes = Buffer.from(text.replace(/\r\n|\r|\n/g, '\n'))
  let out = ''
  let line = ''
  const push = (token: string) => {
    if (line.length + token.length > 75) {
      out += line + '=\r\n'
      line = ''
    }
    line += token
  }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    if (b === 10) {
      // Trailing whitespace before a newline must be encoded.
      if (line.endsWith(' ') || line.endsWith('\t'))
        line = line.slice(0, -1) + (line.endsWith(' ') ? '=20' : '=09')
      out += line + '\r\n'
      line = ''
    } else if ((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9)
      push(String.fromCharCode(b))
    else push('=' + b.toString(16).toUpperCase().padStart(2, '0'))
  }
  return out + line
}

export type BuiltReply = { raw: string; messageId: string; subject: string }

/**
 * Builds the reply saved as a draft or submitted for sending: single-part
 * text/plain (so identical input renders identical output), threading headers
 * from [original], RFC 2047 names and subject, quoted-printable UTF-8 body.
 * [messageId] makes retries idempotent.
 */
export function buildReply(input: {
  original: MailMessage
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bodyText: string
  messageId?: string
  subject?: string
  now?: Date
}): BuiltReply {
  const now = input.now ?? new Date()
  const messageId = input.messageId ?? newMessageId(input.from.address, now)
  // An explicit subject is what the user approved; otherwise Re: <original>.
  const subject = input.subject ?? replySubject(input.original.subject)
  const refs = replyReferences(input.original)
  const headers = [
    fold('Date', rfc2822Date(now)),
    fold('From', formatAddress(input.from)),
    fold('To', input.to.map(formatAddress).join(', ')),
    ...(input.cc.length ? [fold('Cc', input.cc.map(formatAddress).join(', '))] : []),
    fold('Subject', encodeWord(noCrlf(subject))),
    `Message-ID: ${noCrlf(messageId)}`,
    ...(input.original.internetMessageId.trim()
      ? [`In-Reply-To: ${noCrlf(input.original.internetMessageId.trim())}`]
      : []),
    ...(refs.length ? [fold('References', refs.map(noCrlf).join(' '))] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
  ]
  return {
    raw: headers.join('\r\n') + '\r\n\r\n' + quotedPrintable(input.bodyText) + '\r\n',
    messageId,
    subject,
  }
}
