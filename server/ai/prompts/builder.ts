import { randomBytes } from 'node:crypto'
import { defaultRedaction, redact, type RedactionOptions } from '../../../shared/redactor'
import type { DraftIntent, DraftTone, EmailAddress, MailMessage } from '../../../shared/domain'
import { htmlToText, stripQuotedText } from './text'

export type PromptSource = {
  /** Local database id (never shown to the model). */
  messageId: string
  message: MailMessage
  /** One-line summary of earlier messages in the thread, from stored triage summaries. */
  threadContext?: string
}

/** One already-analysed email for the brief. Everything but messageId came from untrusted mail. */
export type BriefEmail = {
  messageId: string
  sender: string
  /** P1..P4 */
  priority: string
  summary: string
  isVip?: boolean
  needsReply?: boolean
  actions?: string[]
}

export type UserContext = {
  name: string
  role?: string
  /** IANA name, informational. */
  timezoneName: string
  /** UTC offset in minutes at an instant. */
  offsetAt(utc: Date): number
  now: Date
  /** The user's own addresses; shown as "me". */
  selfAddresses: Set<string>
  vipSenders?: string[]
  senderHints?: string[]
  signOff?: string
  styleNotes?: string
  /** Reply language, or empty/"auto" to follow the thread. */
  language?: string
}

export type BuiltPrompt = { text: string; boundary: string; idMap: Record<string, string> }

export type BuilderOptions = {
  redaction?: RedactionOptions
  triageBodyCap?: number
  draftBodyCap?: number
  /** Leave bodies out when sorting mail (privacy setting). Drafts always use the thread. */
  triageSubjectOnly?: boolean
  /** Source of boundary bytes; replaceable for golden tests. */
  randomBytes?: (n: number) => Uint8Array
}

/** UTC offset in minutes of an IANA zone at an instant (uses Intl; DST-correct). */
export function zoneOffset(timeZone: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

// ---- text hygiene ---------------------------------------------------------

/** Control/invisible characters that hide or reorder text: C0 (except tab/newline), DEL, zero-width, bidi, BOM. */
const INVISIBLE = new RegExp(
  '[' +
    [
      [0x00, 0x08],
      [0x0b, 0x0c],
      [0x0e, 0x1f],
      [0x7f, 0x7f],
      [0x200b, 0x200f],
      [0x202a, 0x202e],
      [0x2060, 0x2064],
      [0x2066, 0x2069],
      [0xfeff, 0xfeff],
    ]
      .map(([a, b]) => `\\u{${a!.toString(16)}}-\\u{${b!.toString(16)}}`)
      .join('') +
    ']',
  'gu',
)

const clean = (s: string) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/\n{3,}/g, '\n\n')
/** Breaks sequences that could pass for the envelope's own tags. */
const defang = (s: string) =>
  s.replace(/<(\/?)(emails?|thread|user_context)/gi, '< $1$2').replace(/boundary=/g, 'boundary =')
/** Indents every line so no content line can start at column 0 with an envelope key. */
const indent = (s: string) =>
  s
    .split('\n')
    .map((l) => (l === '' ? l : `  ${l}`))
    .join('\n')
const oneLine = (s: string, max: number) => {
  const line = clean(s).replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}
function truncate(s: string, cap: number) {
  if (s.length <= cap) return s
  let cut = s.slice(0, cap)
  const para = cut.lastIndexOf('\n')
  if (para > cap - 300 && para > 0) cut = cut.slice(0, para)
  return `${cut.trimEnd()}\n[truncated]`
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const two = (n: number) => String(n).padStart(2, '0')
/** Wall-clock fields of an instant at a given UTC offset. */
const shift = (utc: Date, offsetMin: number) => new Date(utc.getTime() + offsetMin * 60_000)
const dateOnly = (l: Date) =>
  `${l.getUTCFullYear()}-${two(l.getUTCMonth() + 1)}-${two(l.getUTCDate())}`
const weekday = (l: Date) => DAYS[l.getUTCDay()]!
const hhmm = (l: Date) => `${two(l.getUTCHours())}:${two(l.getUTCMinutes())}`
const offsetText = (m: number) =>
  `${m < 0 ? '-' : '+'}${two(Math.floor(Math.abs(m) / 60))}:${two(Math.abs(m) % 60)}`

const INTENT: Record<DraftIntent, string> = {
  accept: 'accept',
  decline: 'decline',
  ask_for_info: 'ask for more information',
  acknowledge: 'acknowledge',
  custom: 'custom (follow the instruction)',
}

type Prepared = {
  id: string
  from: string
  to: string
  cc: string
  date: string
  subject: string
  attachments: string[]
  threadContext: string | null
  body: string
}

/**
 * The only place raw email content enters an AI request. It converts, trims,
 * redacts and delimits content, and neutralises anything that looks like the
 * envelope's own tags. The system prompts tell the model that everything
 * inside the tags is untrusted data.
 */
export class PromptBuilder {
  readonly triageBodyCap: number
  readonly draftBodyCap: number
  private redaction: RedactionOptions
  private subjectOnly: boolean
  private rnd: (n: number) => Uint8Array

  constructor(o: BuilderOptions = {}) {
    this.redaction = o.redaction ?? defaultRedaction
    this.triageBodyCap = o.triageBodyCap ?? 6000
    this.draftBodyCap = o.draftBodyCap ?? 12_000
    this.subjectOnly = o.triageSubjectOnly ?? false
    this.rnd = o.randomBytes ?? ((n) => randomBytes(n))
  }

  buildTriage(emails: PromptSource[], ctx: UserContext): BuiltPrompt {
    return this.build(emails, ctx, {
      tag: 'emails',
      cap: this.triageBodyCap,
      includeBody: !this.subjectOnly,
    })
  }

  buildDraft(
    thread: PromptSource[],
    ctx: UserContext,
    req: { tone: DraftTone; intent: DraftIntent; instruction?: string },
  ): BuiltPrompt {
    return this.build(thread, ctx, {
      tag: 'thread',
      cap: this.draftBodyCap,
      includeBody: true,
      request: req,
    })
  }

  /** Stored summaries, not full emails. [stats] are context only; the app shows its own counts. */
  buildBrief(
    emails: BriefEmail[],
    ctx: UserContext,
    o: { windowStart: Date; windowEnd: Date; stats: Record<string, number> },
  ): BuiltPrompt {
    const idMap: Record<string, string> = {}
    const lines = emails.map((e, i) => {
      const id = `e${i + 1}`
      idMap[id] = e.messageId
      const field = (v: string, max: number) => oneLine(defang(v), max).replace(/"/g, "'")
      const parts = [
        `id=${id}`,
        `from=${field(e.sender, 80).replace(/\|/g, '/')}${e.isVip ? ' (VIP)' : ''}`,
        e.priority,
        ...(e.needsReply ? ['needsReply'] : []),
        `"${field(e.summary, 300)}"`,
        ...(e.actions?.length
          ? [`actions: [${e.actions.map((a) => `"${field(a, 160)}"`).join(', ')}]`]
          : []),
      ]
      return `- ${parts.join(' | ')}`
    })
    const boundary = this.newBoundary(lines.join('\n'))
    const off = ctx.offsetAt(o.windowEnd)
    const stamp = (t: Date) => {
      const l = shift(t, ctx.offsetAt(t))
      return `${dateOnly(l)}T${hhmm(l)}`
    }
    const today = shift(ctx.now, ctx.offsetAt(ctx.now))
    let out = `window: ${stamp(o.windowStart)} → ${stamp(o.windowEnd)} (${ctx.timezoneName}, UTC${offsetText(off)})\n`
    out += `today: ${dateOnly(today)} (${weekday(today)})\n`
    out += `stats: ${Object.entries(o.stats)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}\n`
    out += `<emails boundary="${boundary}">\n${lines.map((l) => `${l}\n`).join('')}</emails boundary="${boundary}">\n`
    out += this.userContext(ctx, false)
    return { text: out, boundary, idMap }
  }

  private build(
    sources: PromptSource[],
    ctx: UserContext,
    o: {
      tag: string
      cap: number
      includeBody: boolean
      request?: { tone: DraftTone; intent: DraftIntent; instruction?: string }
    },
  ): BuiltPrompt {
    const idMap: Record<string, string> = {}
    const prepared = sources.map((s, i) => {
      const id = `e${i + 1}`
      idMap[id] = s.messageId
      return this.prepare(id, s, ctx, o.cap, o.includeBody)
    })
    const pool = [
      ...prepared.flatMap((p) => [
        p.from,
        p.to,
        p.cc,
        p.subject,
        ...p.attachments,
        p.threadContext ?? '',
        p.body,
      ]),
      ctx.name,
      ctx.role ?? '',
      ctx.styleNotes ?? '',
      o.request?.instruction ?? '',
      ...(ctx.senderHints ?? []),
    ].join('\n')
    const boundary = this.newBoundary(pool)

    let out = `<${o.tag} boundary="${boundary}">\n`
    for (const p of prepared)
      out += `<email id="${p.id}" boundary="${boundary}">\n${render(p)}</email boundary="${boundary}">\n`
    out += `</${o.tag} boundary="${boundary}">\n${this.userContext(ctx, !!o.request)}`
    if (o.request) {
      out += `request:\n  tone: ${o.request.tone}\n  intent: ${INTENT[o.request.intent]}\n`
      const ins = o.request.instruction?.trim()
      if (ins) out += `  instruction: ${oneLine(defang(ins), 500)}\n`
    }
    return { text: out, boundary, idMap }
  }

  private prepare(
    id: string,
    s: PromptSource,
    ctx: UserContext,
    cap: number,
    includeBody: boolean,
  ): Prepared {
    const m = s.message
    const keep = [m.from.address, ...m.to.map((a) => a.address), ...m.cc.map((a) => a.address)]
    const selves = new Set([...ctx.selfAddresses].map((x) => x.toLowerCase()))
    const who = (a: EmailAddress) => {
      if (selves.has(a.address.toLowerCase())) return 'me'
      const name = a.name?.trim() ? `${oneLine(defang(a.name), 80).replace(/[<>]/g, '')} ` : ''
      return name ? `${name}<${a.address}>` : a.address
    }
    let body = !m.bodyText.trim() && m.bodyHtml ? htmlToText(m.bodyHtml) : m.bodyText
    body = stripQuotedText(body).text
    body = redact(body, this.redaction, keep)
    body = truncate(clean(body), cap)
    body = includeBody ? indent(defang(body)) : '  [body not shared]'
    const off = ctx.offsetAt(m.sentAt)
    const local = shift(m.sentAt, off)
    return {
      id,
      from: who(m.from),
      to: m.to.length ? m.to.map(who).join(', ') : '—',
      cc: m.cc.length ? m.cc.map(who).join(', ') : '—',
      date: `${dateOnly(local)}T${hhmm(local)}:${two(local.getUTCSeconds())}${offsetText(off)} (${weekday(local)})`,
      subject: oneLine(defang(redact(m.subject, this.redaction, keep)), 200),
      attachments: m.attachmentNames.slice(0, 10).map((n) => oneLine(defang(n), 80)),
      threadContext: s.threadContext ? oneLine(defang(s.threadContext), 300) : null,
      body,
    }
  }

  private userContext(c: UserContext, forDraft: boolean): string {
    const today = shift(c.now, c.offsetAt(c.now))
    let b = `user_context:\n  name: ${oneLine(defang(c.name), 80)}\n`
    if (c.role?.trim()) b += `  role: ${oneLine(defang(c.role), 80)}\n`
    b += `  timezone: ${c.timezoneName}\n  today: ${dateOnly(today)} (${weekday(today)})\n`
    if (forDraft)
      b += `  sign_off: ${oneLine(defang(c.signOff ?? ''), 80)}\n  style_notes: ${oneLine(defang(c.styleNotes ?? ''), 300)}\n  language: ${c.language ? oneLine(defang(c.language), 20) : 'auto'}\n`
    else
      b += `  vip_senders: [${(c.vipSenders ?? []).map((e) => oneLine(defang(e), 120)).join(', ')}]\n  sender_hints: [${(c.senderHints ?? []).map((e) => `"${oneLine(defang(e), 160).replace(/"/g, "'")}"`).join(', ')}]\n`
    return b
  }

  private newBoundary(content: string): string {
    for (let i = 0; i < 20; i++) {
      const b = Buffer.from(this.rnd(8)).toString('hex')
      if (!content.includes(b)) return b
    }
    return Buffer.from(this.rnd(16)).toString('hex')
  }
}

function render(p: Prepared): string {
  let s = `from: ${p.from}\nto: ${p.to}\ncc: ${p.cc}\ndate: ${p.date}\nsubject: ${p.subject}\n`
  if (p.attachments.length) s += `attachments: ${p.attachments.join(', ')}\n`
  if (p.threadContext) s += `thread_context: ${p.threadContext}\n`
  return `${s}body:\n${p.body}\n`
}
