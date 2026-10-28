import { JSDOM } from 'jsdom'

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
  const doc = new JSDOM(html).window.document
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
