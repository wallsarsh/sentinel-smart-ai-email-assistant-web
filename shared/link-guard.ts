export type LinkRisk =
  'ip_host' | 'punycode' | 'insecure_http' | 'user_info' | 'unusual_port' | 'text_mismatch'

export type LinkAssessment = {
  url: URL
  risks: Set<LinkRisk>
  /** The domain the link text claims, when it mismatches. */
  shownHost?: string
  host: string
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const DOMAIN_TOKEN = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$|\s)/i

const bare = (h: string) => (h.startsWith('www.') ? h.slice(4) : h)
function sameSite(real: string, claimed: string): boolean {
  const a = bare(real.toLowerCase())
  const b = bare(claimed.toLowerCase())
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

/**
 * Lists what is suspicious about [href]. Returns null for links that must
 * never be opened (anything but http, https, mailto or tel).
 */
export function assessLink(href: string, displayText?: string): LinkAssessment | null {
  let url: URL
  try {
    url = new URL(href.trim())
  } catch {
    return null
  }
  const scheme = url.protocol.replace(':', '').toLowerCase()
  if (scheme === 'mailto' || scheme === 'tel') return { url, risks: new Set(), host: '' }
  if (scheme !== 'http' && scheme !== 'https') return null
  if (!url.hostname) return null

  const risks = new Set<LinkRisk>()
  const host = url.hostname.toLowerCase()
  if (IPV4.test(host) || host.startsWith('[') || host.includes(':')) risks.add('ip_host')
  if (host.split('.').some((l) => l.startsWith('xn--'))) risks.add('punycode')
  if (scheme === 'http') risks.add('insecure_http')
  if (url.username || url.password) risks.add('user_info')
  if (
    url.port &&
    !((scheme === 'https' && url.port === '443') || (scheme === 'http' && url.port === '80'))
  )
    risks.add('unusual_port')

  let shownHost: string | undefined
  const claimed = displayText
    ? DOMAIN_TOKEN.exec(displayText.trim())?.[1]?.toLowerCase()
    : undefined
  if (claimed && !sameSite(host, claimed)) {
    risks.add('text_mismatch')
    shownHost = claimed
  }
  return { url, risks, shownHost, host }
}
