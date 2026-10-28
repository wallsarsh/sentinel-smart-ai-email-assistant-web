import { assessLink, type LinkAssessment } from '#shared/link-guard'

/**
 * The only script that runs in a message frame. It reports link clicks and the
 * document height to the parent; it cannot read the parent (the frame has an
 * opaque origin) and the CSP allows no other script.
 */
export const FRAME_SCRIPT = `(function(){var p=function(m){parent.postMessage(m,"*")};document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a");if(!a)return;e.preventDefault();p({sentinel:"link",href:a.getAttribute("href")||"",text:a.textContent||""})});var h=function(){p({sentinel:"height",value:document.documentElement.scrollHeight})};window.addEventListener("load",h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement)})();`

/** sha256 of FRAME_SCRIPT, base64. A test recomputes it so edits cannot drift. */
export const FRAME_SCRIPT_HASH = 'sha256-dL17q0/EfM2Utu0PBXy6n9am7G2fyTJGGjzqNRGiies='

export function frameCsp(loadImages: boolean): string {
  return [
    "default-src 'none'",
    `script-src '${FRAME_SCRIPT_HASH}'`,
    "style-src 'unsafe-inline'",
    `img-src data:${loadImages ? ' https:' : ''}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/**
 * The document shown in the sandboxed iframe. Remote images stay blocked
 * (`data-remote-src`) unless the user opted in for this message.
 */
export function buildFrameDoc(
  sanitizedHtml: string,
  o: { loadImages?: boolean; dark?: boolean } = {},
): string {
  const body = o.loadImages
    ? sanitizedHtml.replace(/ data-remote-src="(https:)/g, ' src="$1')
    : sanitizedHtml
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${frameCsp(!!o.loadImages)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light dark}body{margin:0;padding:8px;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .5em;padding-left:.75em;border-left:3px solid #8884}table{max-width:100%}</style></head><body>${body}<script>${FRAME_SCRIPT}</script></body></html>`
}

export type FrameMessage =
  { sentinel: 'link'; href: string; text: string } | { sentinel: 'height'; value: number }

export function parseFrameMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.sentinel === 'link' && typeof d.href === 'string' && typeof d.text === 'string')
    return { sentinel: 'link', href: d.href.slice(0, 2000), text: d.text.slice(0, 500) }
  if (d.sentinel === 'height' && typeof d.value === 'number' && Number.isFinite(d.value))
    return { sentinel: 'height', value: Math.min(Math.max(Math.round(d.value), 40), 20_000) }
  return null
}

/** What to do with a clicked link: ignore it, open it, or ask first. */
export function decideLink(
  href: string,
  text: string,
):
  | { action: 'ignore' }
  | { action: 'open'; url: string }
  | { action: 'confirm'; assessment: LinkAssessment } {
  const a = assessLink(href, text)
  if (!a) return { action: 'ignore' }
  return a.risks.size === 0
    ? { action: 'open', url: a.url.toString() }
    : { action: 'confirm', assessment: a }
}
