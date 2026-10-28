// Send-gate architecture check (WEB §2, NFR-SEC-10).
// 1) Send primitives may appear only in server/mail/send/.
// 2) That module may be imported only by server/api/send/ and server/container.ts.
// 3) AI, jobs, worker, triage, brief, sync and push code must not mention the send types.
// Exceptions need Security approval in tools/send-gate-allowlist.txt, one
// "path:line:content" fixed string per line exactly as printed here.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const EXTS = new Set(['.ts', '.mts', '.js', '.mjs', '.vue'])
const SEND_DIR = 'server/mail/send'

const SEND_PATTERNS = [
  /messages\/send/,
  /drafts\/send/,
  /\/sendMail/,
  /microsoft\.graph\.send/,
  /\/send['"`]/,
  /\bnodemailer\b/,
  /\bsendMail\s*\(/,
  /MAIL FROM/,
  /\bsmtp-?client\b/i,
]
const IMPORTERS = [/^server\/api\/send\//, /^server\/container\.ts$/, new RegExp(`^${SEND_DIR}/`)]
const NO_SEND_TYPE_DIRS = [
  'server/ai',
  'server/jobs',
  'worker',
  'server/triage',
  'server/brief',
  'server/sync',
  'server/push',
]
const SEND_TYPES = /\b(MailSender|SendGate|SendAuthorization)\b/

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXTS.has(name.slice(name.lastIndexOf('.')))) out.push(p)
  }
  return out
}

/** Returns violation strings for the project under [root]. */
export function check(root = '.', allowlist = []) {
  const allowed = (hit) => allowlist.includes(hit)
  const violations = []
  const files = ['server', 'worker', 'app', 'shared'].flatMap((d) => walk(join(root, d)))
  for (const abs of files) {
    const rel = relative(root, abs).split(sep).join('/')
    const lines = readFileSync(abs, 'utf8').split('\n')
    lines.forEach((text, i) => {
      const hit = `${rel}:${i + 1}:${text.trim()}`
      if (allowed(hit)) return
      if (!rel.startsWith(`${SEND_DIR}/`)) {
        for (const p of SEND_PATTERNS) {
          if (p.test(text)) violations.push(`send primitive ${p} outside ${SEND_DIR} -> ${hit}`)
        }
      }
      if (
        /(?:import|from|require\()\s*['"`][^'"`]*mail\/send\//.test(text) ||
        (/send-gate/.test(text) && /import/.test(text))
      ) {
        if (!IMPORTERS.some((re) => re.test(rel)))
          violations.push(`send module imported from a forbidden place -> ${hit}`)
      }
      if (
        NO_SEND_TYPE_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`)) &&
        SEND_TYPES.test(text)
      ) {
        violations.push(`send type referenced from restricted code -> ${hit}`)
      }
    })
  }
  return violations
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const allow = existsSync('tools/send-gate-allowlist.txt')
    ? readFileSync('tools/send-gate-allowlist.txt', 'utf8').split('\n').filter(Boolean)
    : []
  const v = check('.', allow)
  if (v.length) {
    console.error(v.map((x) => `SEND GATE: ${x}`).join('\n'))
    console.error('\nEmail may only be sent through the user-confirmed send flow (WEB §2).')
    process.exit(1)
  }
  console.log('Send-gate check passed.')
}
