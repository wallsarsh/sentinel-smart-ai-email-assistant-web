// Pure helpers for the Thunderbird installer. No side effects, so they are unit-tested without a network.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const ADDON_ID = 'sentinel-spike@example.invalid'
const MOZILLA_HOSTS = /(^|\.)(mozilla\.org|mozilla\.net|mozilla\.com)$/i

export const HELP = `Sentinel AI — Thunderbird installer

Downloads Thunderbird from Mozilla (checksum-verified), installs it for your user only
(no admin rights) and installs the Sentinel AI add-on into a Thunderbird profile.

Usage: node installer/install.mjs [options]

  --channel esr|release   Thunderbird channel (default esr; unsigned add-ons need esr)
  --lang en-US            Thunderbird language (default en-US)
  --dir PATH              Install location for Thunderbird and the dedicated profile
  --profile-dir PATH      Install the add-on into this existing profile instead
  --use-system            Do not download; use the Thunderbird already on this machine
  --xpi PATH              Use a prebuilt add-on package instead of building one
  --no-launch             Do not start Thunderbird afterwards
  --yes                   Answer yes to questions (still never touches an existing profile unless --profile-dir)
  --dry-run               Show what would happen and change nothing
  --uninstall             Remove what this installer put in place (keeps your mail profile)
  --help
`

export function parseArgs(argv) {
  const o = { channel: 'esr', lang: 'en-US', launch: true, yes: false, dryRun: false, uninstall: false, useSystem: false }
  const need = (i, name) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${name} needs a value`)
    return argv[i + 1]
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') o.help = true
    else if (a === '--channel') o.channel = need(i++, a)
    else if (a === '--lang') o.lang = need(i++, a)
    else if (a === '--dir') o.dir = need(i++, a)
    else if (a === '--profile-dir') o.profileDir = need(i++, a)
    else if (a === '--xpi') o.xpi = need(i++, a)
    else if (a === '--use-system') o.useSystem = true
    else if (a === '--no-launch') o.launch = false
    else if (a === '--yes' || a === '-y') o.yes = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--uninstall') o.uninstall = true
    else throw new Error(`Unknown option: ${a}`)
  }
  if (!['esr', 'release'].includes(o.channel)) throw new Error('--channel must be esr or release')
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(o.lang)) throw new Error('--lang must look like en-US')
  return o
}

/** Mozilla's `os` parameter for this machine, or an explanation of why it is unsupported. */
export function mozillaOs(platform = process.platform, arch = process.arch) {
  if (platform === 'linux' && arch === 'x64') return 'linux64'
  if (platform === 'darwin') return 'osx'
  if (platform === 'win32' && arch === 'x64') return 'win64'
  throw new Error(`Automatic download is not available for ${platform}/${arch}. Install Thunderbird yourself and re-run with --use-system.`)
}

export const downloadEntryUrl = ({ channel, os, lang }) =>
  `https://download.mozilla.org/?product=${channel === 'esr' ? 'thunderbird-esr-latest' : 'thunderbird-latest'}&os=${os}&lang=${encodeURIComponent(lang)}`

/** Follows Mozilla's redirect (without downloading) and returns where the installer file really lives. */
export async function resolveDownload(opts, fetchImpl = fetch) {
  const res = await fetchImpl(downloadEntryUrl(opts), { redirect: 'manual' })
  const location = res.headers.get('location')
  if (!location || res.status < 300 || res.status > 399) throw new Error(`Mozilla did not return a download location (HTTP ${res.status}).`)
  const url = new URL(location, 'https://download.mozilla.org/')
  if (url.protocol !== 'https:' || !MOZILLA_HOSTS.test(url.hostname)) throw new Error(`Refusing a download from ${url.hostname}.`)
  const m = /\/releases\/([^/]+)\/(.+)$/.exec(url.pathname)
  if (!m) throw new Error('The download location has an unexpected shape.')
  return { url: url.href, version: m[1], key: decodeURIComponent(m[2]), file: decodeURIComponent(m[2].split('/').pop()) }
}

/** `<hex>  <path>` lines → Map(path → hex). */
export function parseSums(text) {
  const out = new Map()
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}|[0-9a-f]{128})\s+\*?(.+)$/i.exec(line.trim())
    if (m) out.set(m[2], m[1].toLowerCase())
  }
  return out
}

/** Fetches Mozilla's published checksum for the resolved file. Fails closed when none is found. */
export async function expectedChecksum({ version, key }, fetchImpl = fetch) {
  for (const [name, algo] of [['SHA512SUMS', 'sha512'], ['SHA256SUMS', 'sha256']]) {
    const res = await fetchImpl(`https://archive.mozilla.org/pub/thunderbird/releases/${version}/${name}`)
    if (!res.ok) continue
    const hex = parseSums(await res.text()).get(key)
    if (hex) return { algo, hex }
  }
  throw new Error(`No published checksum found for ${key}. Refusing to install an unverified download.`)
}

export function sha(file, algo) {
  return new Promise((resolve, reject) => {
    const h = createHash(algo)
    createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

/** Preferences that let a profile load this unsigned add-on without prompts. */
export const USER_JS = `// Written by the Sentinel AI installer.
// Lets Thunderbird (ESR) load the unsigned Sentinel add-on from this profile.
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.autoDisableScopes", 0);
`

/** Idempotently merges our block into an existing user.js. */
export function mergeUserJs(existing = '') {
  const clean = existing.replace(/\/\/ Written by the Sentinel AI installer\.[\s\S]*?autoDisableScopes", 0\);\n?/, '')
  return `${clean}${clean && !clean.endsWith('\n') ? '\n' : ''}${USER_JS}`
}

/** Per-OS locations. */
export function paths(platform = process.platform, env = process.env, home = homedir()) {
  const data =
    platform === 'win32' ? join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'SentinelThunderbird')
    : platform === 'darwin' ? join(home, 'Library', 'Application Support', 'SentinelThunderbird')
    : join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'sentinel-thunderbird')
  const profilesRoot =
    platform === 'win32' ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'Thunderbird')
    : platform === 'darwin' ? join(home, 'Library', 'Thunderbird')
    : join(home, '.thunderbird')
  return { data, profilesRoot }
}

/** Default profile directory from a profiles.ini / installs.ini text, or null. */
export function defaultProfileFromIni(profilesIni, root) {
  const sections = []
  let cur = null
  for (const raw of String(profilesIni).split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^\[(.+)\]$/.exec(line)
    if (head) sections.push((cur = { name: head[1], kv: {} }))
    else if (cur && line.includes('=')) cur.kv[line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1)
  }
  const profiles = sections.filter((s) => /^Profile\d+$/.test(s.name))
  const pick =
    profiles.find((p) => p.kv.Default === '1') ??
    profiles.find((p) => /default/i.test(p.kv.Name ?? '')) ??
    (profiles.length === 1 ? profiles[0] : null)
  if (!pick?.kv.Path) return null
  return pick.kv.IsRelative === '0' ? pick.kv.Path : join(root, pick.kv.Path)
}

export const launcherScript = ({ app, profile }) =>
  `#!/bin/sh\nexec "${app}" --profile "${profile}" "$@"\n`

export const desktopEntry = ({ launcher, icon }) =>
  `[Desktop Entry]\nType=Application\nName=Thunderbird (Sentinel AI)\nComment=Thunderbird with the Sentinel AI assistant\nExec="${launcher}" %u\n${icon ? `Icon=${icon}\n` : ''}Terminal=false\nCategories=Network;Email;\nMimeType=x-scheme-handler/mailto;\n`
