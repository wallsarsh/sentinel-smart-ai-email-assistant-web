// Fails when a tracked file looks like it contains a real secret. Run: node tools/secrets-scan.mjs
// Placeholders are allowed in files listed in ALLOW_PATHS (examples and tests); real values never are.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const RULES = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghs|ghu|github_pat)_[0-9A-Za-z_]{30,}\b/],
  ['Anthropic/OpenAI key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/],
  [
    'VAPID/other private key assignment',
    /(?:PRIVATE_KEY|CLIENT_SECRET|API_KEY|SESSION_SECRET|KEK_BASE64)\s*=\s*["']?[A-Za-z0-9+/_-]{24,}={0,2}/,
  ],
]

/** Paths where obvious placeholders are expected (documented examples and test fixtures). */
export const ALLOW_PATHS = [
  /^\.env\.example$/,
  /^tests\//,
  /^docs\//,
  /^tasks\//,
  /^tools\/secrets-scan\.mjs$/,
  /^package-lock\.json$/,
]
export const FORBIDDEN_FILES = [/^\.env$/, /^\.env\.(?!example)/, /\.pem$/, /\.p12$/, /id_rsa/]

export function scanText(path, text) {
  if (ALLOW_PATHS.some((re) => re.test(path))) return []
  return RULES.filter(([, re]) => re.test(text)).map(([name]) => `${path}: ${name}`)
}

export function scanFiles(files, read = (f) => readFileSync(f, 'utf8')) {
  const out = []
  for (const f of files) {
    if (FORBIDDEN_FILES.some((re) => re.test(f)))
      out.push(`${f}: file that should not be committed`)
    if (/\.(png|ico|woff2?|zip|jpg)$/.test(f)) continue
    let text
    try {
      text = read(f)
    } catch {
      continue
    }
    out.push(...scanText(f, text))
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
  const found = scanFiles(files)
  for (const f of found) console.error(`possible secret - ${f}`)
  process.exit(found.length ? 1 : 0)
}
