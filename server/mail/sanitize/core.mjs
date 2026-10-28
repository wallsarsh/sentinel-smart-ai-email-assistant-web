// Sanitizer core (plain JS so it can run both inline and inside a worker thread).
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]
const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'colspan',
  'rowspan',
  'align',
  'valign',
  'color',
  'bgcolor',
  'dir',
  'lang',
  'style',
  'data-remote-src',
  'data-blocked-image',
  'rel',
  'target',
]
const SAFE_CSS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
  'line-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-collapse',
  'width',
  'height',
  'max-width',
  'vertical-align',
  'white-space',
])

/** Keeps only allow-listed declarations without urls, expressions or imports. */
export function cleanStyle(style) {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      const i = d.indexOf(':')
      if (i < 1) return false
      const prop = d.slice(0, i).trim().toLowerCase()
      const val = d
        .slice(i + 1)
        .trim()
        .toLowerCase()
      return SAFE_CSS.has(prop) && !/url\s*\(|expression|@import|javascript:|behavior|\\/.test(val)
    })
    .join('; ')
}

const SAFE_LINK = /^(https?:|mailto:|tel:)/i
const isTracker = (el) => {
  const w = el.getAttribute('width')
  const h = el.getAttribute('height')
  return (w === '1' || w === '0') && (h === '1' || h === '0')
}

/**
 * @param {string} html untrusted HTML
 * @param {{ allowRemoteImages?: boolean }} opts
 * @returns {{ html: string, blockedImages: number }}
 */
export function sanitize(html, opts = {}) {
  const window = new JSDOM('').window
  const purify = createDOMPurify(window)
  let blocked = 0
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('style')) {
      const cleaned = cleanStyle(node.getAttribute('style') || '')
      if (cleaned) node.setAttribute('style', cleaned)
      else node.removeAttribute('style')
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      if (!SAFE_LINK.test(href)) node.removeAttribute('href')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
      node.setAttribute('target', '_blank')
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || ''
      if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) || /^cid:/i.test(src)) return
      if (/^https?:\/\//i.test(src)) {
        if (isTracker(node) && !opts.allowRemoteImages) {
          node.remove()
          blocked++
          return
        }
        if (opts.allowRemoteImages) return
        // Keep the address aside so "load images" can restore it; nothing is fetched now.
        node.setAttribute('data-remote-src', src)
        node.setAttribute('data-blocked-image', '1')
        node.removeAttribute('src')
        blocked++
      } else {
        node.remove()
      }
    }
  })
  const out = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: [
      'style',
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'svg',
      'math',
      'link',
      'meta',
      'base',
    ],
    KEEP_CONTENT: true,
  })
  return { html: String(out), blockedImages: blocked }
}
