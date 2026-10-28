// Fails on high/critical advisories unless listed in tools/audit-allowlist.json
// (advisory ids with a reason and an expiry date, approved by Security).
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

export function failing(report, allow, now = new Date()) {
  const ok = new Set(allow.filter((a) => new Date(a.expires) > now).map((a) => String(a.id)))
  const out = []
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    if (!['high', 'critical'].includes(v.severity)) continue
    const ids = (v.via ?? []).filter((x) => typeof x === 'object').map((x) => String(x.source))
    if (ids.length === 0 || !ids.every((id) => ok.has(id))) out.push(`${name} (${v.severity})`)
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let json
  try {
    json = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    json = e.stdout
  }
  const allow = existsSync('tools/audit-allowlist.json')
    ? JSON.parse(readFileSync('tools/audit-allowlist.json', 'utf8'))
    : []
  const bad = failing(JSON.parse(json), allow)
  if (bad.length) {
    console.error('High/critical advisories:\n' + bad.join('\n'))
    process.exit(1)
  }
  console.log('Audit passed.')
}
