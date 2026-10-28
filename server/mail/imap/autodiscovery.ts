import { promises as dns } from 'node:dns'
import { connect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { safeFetch } from '../../http/safe-fetch'
import { isPublicAddress, systemResolver, type Resolver } from '../../http/ssrf'
import type { ImapSettings } from '../../../shared/domain'

type Security = ImapSettings['imapSecurity']
export type ServerSettings = Omit<
  ImapSettings,
  'draftsFolder' | 'sentFolder' | 'serverSavesSent' | 'smtpUsername'
>
export type Discovered = {
  settings: ServerSettings
  source: 'table' | 'autoconfig' | 'srv' | 'guess'
  /** True when the user needs an app-specific password (Apple, Yahoo, ...). */
  appPassword?: boolean
}

const s = (
  imapHost: string,
  smtpHost: string,
  extra: Partial<ServerSettings> = {},
): ServerSettings => ({
  imapHost,
  imapPort: 993,
  imapSecurity: 'implicit_tls',
  username: '{email}',
  smtpHost,
  smtpPort: 465,
  smtpSecurity: 'implicit_tls',
  ...extra,
})

/** Providers known offline. `{email}` in `username` stands for the full address. */
export const KNOWN: Record<string, { settings: ServerSettings; appPassword?: boolean }> = {
  'icloud.com': {
    settings: s('imap.mail.me.com', 'smtp.mail.me.com', {
      smtpPort: 587,
      smtpSecurity: 'start_tls',
    }),
    appPassword: true,
  },
  'me.com': {
    settings: s('imap.mail.me.com', 'smtp.mail.me.com', {
      smtpPort: 587,
      smtpSecurity: 'start_tls',
    }),
    appPassword: true,
  },
  'yahoo.com': { settings: s('imap.mail.yahoo.com', 'smtp.mail.yahoo.com'), appPassword: true },
  'aol.com': { settings: s('imap.aol.com', 'smtp.aol.com'), appPassword: true },
  'fastmail.com': { settings: s('imap.fastmail.com', 'smtp.fastmail.com'), appPassword: true },
  'zoho.com': { settings: s('imap.zoho.com', 'smtp.zoho.com') },
  'gmx.com': {
    settings: s('imap.gmx.com', 'mail.gmx.com', { smtpPort: 587, smtpSecurity: 'start_tls' }),
  },
  'gmx.net': {
    settings: s('imap.gmx.net', 'mail.gmx.net', { smtpPort: 587, smtpSecurity: 'start_tls' }),
  },
  'proton.me': {
    settings: s('127.0.0.1', '127.0.0.1', {
      imapPort: 1143,
      imapSecurity: 'start_tls',
      smtpPort: 1025,
      smtpSecurity: 'start_tls',
    }),
  },
  'outlook.com': {
    settings: s('outlook.office365.com', 'smtp-mail.outlook.com', {
      smtpPort: 587,
      smtpSecurity: 'start_tls',
    }),
  },
}
const ALIAS: Record<string, string> = {
  'yahoo.co.uk': 'yahoo.com',
  'ymail.com': 'yahoo.com',
  'hotmail.com': 'outlook.com',
  'live.com': 'outlook.com',
  'msn.com': 'outlook.com',
  'fastmail.fm': 'fastmail.com',
  'protonmail.com': 'proton.me',
  'pm.me': 'proton.me',
}
/** MX host suffix → provider domain, for company domains hosted by a known provider. */
const MX_SUFFIX: [RegExp, string][] = [
  [/\.mx\.mail\.me\.com\.?$/i, 'icloud.com'],
  [/\.yahoodns\.net\.?$/i, 'yahoo.com'],
  [/\.messagingengine\.com\.?$/i, 'fastmail.com'],
  [/\.zoho\.(com|eu)\.?$/i, 'zoho.com'],
]

export type DiscoveryDeps = {
  fetchText?: (url: string) => Promise<string | null>
  resolveMx?: (domain: string) => Promise<string[]>
  resolveSrv?: (name: string) => Promise<{ name: string; port: number }[]>
}

const defaultDeps = (): Required<DiscoveryDeps> => ({
  async fetchText(url) {
    try {
      const r = await safeFetch(url, { timeoutMs: 5000, maxBytes: 100_000, retries: 0 })
      return r.status === 200 ? r.text : null
    } catch {
      return null
    }
  },
  async resolveMx(d) {
    try {
      return (await dns.resolveMx(d)).sort((a, b) => a.priority - b.priority).map((x) => x.exchange)
    } catch {
      return []
    }
  },
  async resolveSrv(n) {
    try {
      return await dns.resolveSrv(n)
    } catch {
      return []
    }
  },
})

const sec = (v: string | undefined): Security =>
  v?.toUpperCase() === 'STARTTLS' ? 'start_tls' : 'implicit_tls'

/** Parses Mozilla autoconfig XML (config-v1.1). Takes the first IMAP and SMTP server. */
export function parseAutoconfig(xml: string, email: string): ServerSettings | null {
  const server = (type: string) => {
    const m = new RegExp(
      `<(?:incoming|outgoing)Server\\s+type="${type}"[^>]*>([\\s\\S]*?)</(?:incoming|outgoing)Server>`,
      'i',
    ).exec(xml)
    if (!m) return null
    const g = (t: string) => new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`, 'i').exec(m[1]!)?.[1]
    const host = g('hostname')
    const port = Number(g('port'))
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
    const user = (g('username') ?? '%EMAILADDRESS%')
      .replace(/%EMAILADDRESS%/g, email)
      .replace(/%EMAILLOCALPART%/g, email.split('@')[0]!)
      .replace(/%EMAILDOMAIN%/g, email.split('@')[1]!)
    return { host, port, security: sec(g('socketType')), user }
  }
  const imap = server('imap')
  const smtp = server('smtp')
  if (!imap || !smtp) return null
  return {
    imapHost: imap.host,
    imapPort: imap.port,
    imapSecurity: imap.security,
    username: imap.user,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    smtpSecurity: smtp.security,
  }
}

const withUser = (x: ServerSettings, email: string): ServerSettings => ({
  ...x,
  username: x.username === '{email}' ? email : x.username,
})

/**
 * Finds IMAP/SMTP settings for an address: built-in table (offline), then the
 * provider's Mozilla autoconfig, then MX → known provider, then SRV records,
 * then a guess from the domain. Everything over the network is vetted by the
 * SSRF guard, and nothing here talks to the mail servers themselves.
 */
export async function discover(
  email: string,
  deps: DiscoveryDeps = {},
): Promise<Discovered | null> {
  const d = { ...defaultDeps(), ...deps }
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const domain = email.slice(at + 1).toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null

  const key = ALIAS[domain] ?? domain
  const known = KNOWN[key]
  if (known)
    return {
      source: 'table',
      settings: withUser(known.settings, email),
      appPassword: known.appPassword,
    }

  for (const url of [
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
  ]) {
    const xml = await d.fetchText(url)
    const parsed = xml && parseAutoconfig(xml, email)
    if (parsed) return { source: 'autoconfig', settings: parsed }
  }

  for (const mx of await d.resolveMx(domain)) {
    const hit = MX_SUFFIX.find(([re]) => re.test(mx))
    if (hit) {
      const k = KNOWN[hit[1]]!
      return { source: 'table', settings: withUser(k.settings, email), appPassword: k.appPassword }
    }
  }

  const imaps = (await d.resolveSrv(`_imaps._tcp.${domain}`))[0]
  const sub = (await d.resolveSrv(`_submissions._tcp.${domain}`))[0]
  if (imaps)
    return {
      source: 'srv',
      settings: s(imaps.name, sub?.name ?? imaps.name.replace(/^imap/, 'smtp'), {
        imapPort: imaps.port,
        username: email,
        smtpPort: sub?.port ?? 465,
      }),
    }

  return { source: 'guess', settings: s(`imap.${domain}`, `smtp.${domain}`, { username: email }) }
}

export type ProbeResult =
  { ok: true } | { ok: false; reason: 'private_address' | 'unreachable' | 'tls_failed' | 'timeout' }

/**
 * Checks that host:port accepts a connection (TLS for implicit_tls). Resolves
 * the host first and refuses private/loopback addresses, then connects to the
 * vetted IP, so probing cannot be used to scan internal networks.
 */
export async function probe(
  host: string,
  port: number,
  security: Security,
  o: { resolver?: Resolver; timeoutMs?: number; allowPrivate?: boolean } = {},
): Promise<ProbeResult> {
  const addrs = await (o.resolver ?? systemResolver)(host).catch(() => [] as string[])
  const ip = addrs[0]
  if (!ip) return { ok: false, reason: 'unreachable' }
  if (!o.allowPrivate && !addrs.every(isPublicAddress))
    return { ok: false, reason: 'private_address' }
  return new Promise((resolve) => {
    const done = (r: ProbeResult) => {
      sock.destroy()
      resolve(r)
    }
    const sock =
      security === 'implicit_tls'
        ? tlsConnect({ host: ip, port, servername: host, timeout: o.timeoutMs ?? 5000 }, () =>
            done({ ok: true }),
          )
        : connect({ host: ip, port, timeout: o.timeoutMs ?? 5000 }, () => done({ ok: true }))
    sock.on('timeout', () => done({ ok: false, reason: 'timeout' }))
    sock.on('error', (e: NodeJS.ErrnoException) =>
      done({
        ok: false,
        reason:
          e.code?.startsWith('ERR_TLS') || e.code === 'ERR_SSL_WRONG_VERSION_NUMBER'
            ? 'tls_failed'
            : 'unreachable',
      }),
    )
  })
}
