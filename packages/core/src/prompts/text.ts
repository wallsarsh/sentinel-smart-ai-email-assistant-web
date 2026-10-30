type Parse = (html: string) => Document
let parse: Parse = (html) => {
  if (typeof DOMParser === 'undefined') throw new Error('No HTML parser is available.')
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Replaces the HTML parser (Node has no DOMParser; the server plugs in jsdom). */
export function setHtmlParser(p: Parse) {
  parse = p
}

const NBSP = String.fromCharCode(0xa0)
const SKIP = new Set(['script', 'style', 'head', 'title', 'noscript', 'template'])
const BLOCK = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'table',
  'tr',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'hr',
])

function hidden(e: Element): boolean {
  const style = (e.getAttribute('style') ?? '').toLowerCase().replace(/ /g, '')
  return (
    style.includes('display:none') ||
    style.includes('visibility:hidden') ||
    style.includes('font-size:0') ||
    e.hasAttribute('hidden')
  )
}

/**
 * HTML email body → readable text. Scripts, styles and hidden or tracking
 * elements are dropped; block elements become line breaks; list items get "- ".
 */
export function htmlToText(html: string): string {
  const doc = parse(html)
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += (node.textContent ?? '').replace(/\s+/g, ' ')
      return
    }
    if (node.nodeType !== 1) {
      node.childNodes.forEach(walk)
      return
    }
    const el = node as Element
    const tag = el.localName
    if (SKIP.has(tag) || hidden(el)) return
    if (tag === 'br') {
      out += '\n'
      return
    }
    if (tag === 'img') return // alt text of tracking pixels is noise
    const block = BLOCK.has(tag)
    if (block) out += '\n'
    if (tag === 'li') out += '\n- '
    if (tag === 'td' || tag === 'th') out += ' '
    el.childNodes.forEach(walk)
    if (block) out += '\n'
  }
  walk(doc.body ?? doc.documentElement)
  return out
    .replaceAll(NBSP, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ATTRIBUTION =
  /^(?:On|Am|Le|El|Il|Op|Em)\b.{0,200}?\b(?:wrote|a écrit|escribió|ha scritto|escreveu)\s*:?\s*$|^(?:Am|Op)\b.{0,200}?\b(?:schrieb|schreef)\b.{0,150}:\s*$/i
const ATTRIBUTION_START = /^(?:On|Am|Le|El|Il|Op|Em)\s/i
const ORIGINAL =
  /^\s*-{2,}\s*(?:Original Message|Forwarded message|Ursprüngliche Nachricht|Message d.origine)\s*-{2,}\s*$/i
const OUTLOOK_FROM = /^\s*(?:From|Von|De|Da)\s*:\s*.+/i
const OUTLOOK_SENT = /^\s*(?:Sent|Date|Gesendet|Envoy[ée]|Enviado)\s*:\s*.+/i
const UNDERSCORE_RULE = /^\s*_{10,}\s*$/
const MOBILE_FOOTER =
  /^\s*(?:Sent from my .+|Sent from Outlook for .+|Get Outlook for .+|Sent from Mail for Windows.*|Von meinem .+ gesendet)\s*$/i

export type Stripped = { text: string; removedChars: number }

/** Removes quoted history, "-- " signatures and mobile footers so only new content reaches the AI. */
export function stripQuotedText(body: string): Stripped {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line === '-- ' || line.trimEnd() === '--') {
      end = i
      break
    }
    if (ORIGINAL.test(line)) {
      end = i
      break
    }
    if (ATTRIBUTION.test(line.trim()) || wrapped(lines, i)) {
      end = i
      break
    }
    if (OUTLOOK_FROM.test(line) && headerBlockFollows(lines, i)) {
      end = i
      if (end > 0 && UNDERSCORE_RULE.test(lines[end - 1]!)) end--
      break
    }
    if (line.startsWith('>')) {
      end = i
      break
    }
  }
  const text = lines
    .slice(0, end)
    .filter((l) => !MOBILE_FOOTER.test(l))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, removedChars: Math.min(Math.max(body.length - text.length, 0), body.length) }
}

function wrapped(lines: string[], i: number): boolean {
  if (!ATTRIBUTION_START.test(lines[i]!.trim()) || i + 1 >= lines.length) return false
  return ATTRIBUTION.test(`${lines[i]!.trim()} ${lines[i + 1]!.trim()}`)
}
function headerBlockFollows(lines: string[], i: number): boolean {
  for (let j = i + 1; j <= i + 3 && j < lines.length; j++)
    if (OUTLOOK_SENT.test(lines[j]!)) return true
  return false
}

const DECORATION = /^\s*[-=_*~#.•·]{4,}\s*$/
const DISCLAIMER =
  /^\s*(?:confidentiality notice|disclaimer\b|this (?:e-?mail|message)\b.{0,120}\b(?:confidential|intended (?:only )?for|privileged)|the information (?:contained )?in this (?:e-?mail|message))/i
const UNSUBSCRIBE =
  /^\s*(?:you (?:are )?receiv(?:ed|ing) this (?:e-?mail|message) because|to unsubscribe|unsubscribe\b|view (?:this email )?in (?:your )?browser|manage (?:your )?(?:email )?preferences)/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

/**
 * Drops what never helps a summary or a reply: tracking-heavy URLs (kept as host + "…"), rules of dashes,
 * legal disclaimers and unsubscribe footers at the end, and runs of blank lines.
 */
export function trimNoise(body: string): string {
  let lines = body.split('\n')
  for (let i = Math.floor(lines.length / 3); i < lines.length; i++) {
    if (DISCLAIMER.test(lines[i]!) || UNSUBSCRIBE.test(lines[i]!)) {
      lines = lines.slice(0, i)
      break
    }
  }
  return lines
    .filter((l) => !DECORATION.test(l))
    .join('\n')
    .replace(URL_RE, (u) => {
      if (u.length <= 60) return u
      try {
        return `${new URL(u).origin}/…`
      } catch {
        return u.slice(0, 60)
      }
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
