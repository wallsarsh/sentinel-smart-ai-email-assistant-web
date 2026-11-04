#!/usr/bin/env node
// Generate realistic demo mail for a busy IT day at a non-profit.
//
//   npm run demo:mail -- --days 5
//   npm run demo:mail -- --weeks 2 --per-day 45
//   npm run demo:mail -- --months 1
//   npm run demo:mail -- --start 2026-10-01 --end 2026-10-31
//   npm run demo:mail -- --days 5 --apply --folder "Sentinel Demo"
//
// The default writes .eml files and an mbox file under demo-mail/. With --apply it also appends
// the mbox to a Thunderbird Local Folders mailbox. Close Thunderbird before --apply.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PERSONA = {
  name: 'Priya Raman',
  role: 'Head of IT',
  org: 'Bright Steps Foundation',
  email: 'priya.raman@brightsteps.example',
  it: 'it@brightsteps.example',
}

const PEOPLE = [
  { name: 'Maya Chen', email: 'maya.chen@brightsteps.example', role: 'Finance Director' },
  { name: 'Daniel Okafor', email: 'daniel.okafor@brightsteps.example', role: 'Grants Manager' },
  { name: 'Sofia Alvarez', email: 'sofia.alvarez@brightsteps.example', role: 'Volunteer Coordinator' },
  { name: 'Ben Carter', email: 'ben.carter@brightsteps.example', role: 'Programme Lead' },
  { name: 'Aisha Bello', email: 'aisha.bello@brightsteps.example', role: 'HR Partner' },
  { name: 'Tom Hughes', email: 'tom.hughes@brightsteps.example', role: 'Office Manager' },
  { name: 'Ruth Green', email: 'ruth.green@brightsteps.example', role: 'Board Chair' },
  { name: 'Alex Morgan', email: 'alex.morgan@brightsteps.example', role: 'Communications Lead' },
  { name: 'IT Service Desk', email: 'servicedesk@brightsteps.example', role: 'Service Desk' },
  { name: 'Microsoft 365', email: 'no-reply@microsoft.example', role: 'Vendor' },
  { name: 'CloudBackup', email: 'alerts@cloudbackup.example', role: 'Vendor' },
  { name: 'DonorFlow', email: 'billing@donorflow.example', role: 'Vendor' },
  { name: 'Northwind ISP', email: 'support@northwind.example', role: 'Vendor' },
  { name: 'CyberShield', email: 'alerts@cybershield.example', role: 'Security' },
  { name: 'Nonprofit Tech Weekly', email: 'newsletter@nonprofit-tech.example', role: 'Newsletter' },
  { name: 'Priya Raman', email: PERSONA.email, role: 'Self' },
]

const TOPICS = [
  {
    kind: 'work',
    subjects: ['Laptop refresh for the programmes team', 'VPN access for the new starter', 'Shared drive permissions for grants', 'Teams guest access for the auditor'],
    bodies: [
      'Hi Priya,\n\nCan you help with {ask}? It is needed for {when}.\n\nThanks,\n{name}',
      'Priya — {ask}. I have added the details below so we can keep this moving.\n\nWhat do you need from me?\n\n{name}',
    ],
    replies: ['Thanks, that works for me. Could you confirm the next step?', 'I have added the request to the queue. I will update you once it is done.', 'Can we do this before the end of the day? The team is blocked.'],
  },
  {
    kind: 'meeting',
    subjects: ['Board technology update — Thursday 10:00', 'Weekly IT and operations sync', 'Vendor review: CloudBackup renewal'],
    bodies: [
      'Hi Priya,\n\nCould we meet to review {topic}? I can do {when}. The agenda is attached in the shared notes.\n\nThanks,\n{name}',
      'Please can you join a short call about {topic}? I would like to agree the next steps before the board pack is finalised.\n\n{name}',
    ],
    replies: ['That time works. I will send an invite.', 'I can join, but I may be five minutes late.', 'Could we move this to the afternoon?'],
  },
  {
    kind: 'finance',
    subjects: ['Invoice approval: Northwind ISP October', 'DonorFlow platform renewal quote', 'Microsoft 365 licence true-up'],
    bodies: [
      'Hi Priya,\n\nThe {vendor} invoice for {amount} is ready for approval. It covers {period}. Please confirm the cost centre and I will process it.\n\nMaya',
      'We have received the renewal quote from {vendor}. The total is {amount}. Can you confirm whether we keep the current seat count?\n\nMaya',
    ],
    replies: ['Approved — use the IT cost centre.', 'Please hold until I confirm the budget line.', 'Can you send the breakdown by team?'],
  },
  {
    kind: 'security',
    subjects: ['Security alert: sign-in from a new device', 'Phishing report: fake invoice email', 'Action required: password expiry for shared account'],
    bodies: [
      'A sign-in to your account was blocked because it came from a new device. If this was you, no action is needed. If not, reset your password and contact the service desk.\n\nCyberShield',
      'We received a report of a fake invoice email claiming to be from a supplier. Do not open the attachment. The message has been quarantined.\n\nSecurity team',
    ],
    replies: ['Thanks — I have reset the password and reviewed the active sessions.', 'Please block the sender domain at the gateway.'],
  },
  {
    kind: 'vendor',
    subjects: ['CloudBackup job failed for the file server', 'Northwind circuit maintenance window', 'DonorFlow API changes next month'],
    bodies: [
      'Hello,\n\nWe detected a failed backup job for the file server. The next retry is scheduled for 02:00. Please confirm that the server is reachable.\n\nCloudBackup alerts',
      'Dear customer,\n\nA planned maintenance window will affect your circuit on {when}. No action is required, but services may be intermittent for up to 30 minutes.\n\nNorthwind support',
    ],
    replies: ['The server is reachable now. Please rerun the job.', 'Thanks for the notice. I will tell the office team.'],
  },
  {
    kind: 'notification',
    subjects: ['Ticket #4821 updated: printer on floor 2', 'New starter account created', 'Meeting room display offline'],
    bodies: [
      'Your ticket has been updated.\n\nStatus: waiting for parts\nOwner: Tom Hughes\nLast update: the replacement adapter has been ordered.\n\nService desk',
      'A new starter account has been created for the programmes team. The manager must complete the access review before Friday.\n\nIdentity automation',
    ],
    replies: [],
    auto: true,
  },
  {
    kind: 'newsletter',
    subjects: ['Five ways small nonprofits can simplify IT', 'October nonprofit tech roundup', 'Free webinar: secure remote work for lean teams'],
    bodies: [
      'This month: practical identity hygiene, low-cost backup patterns, and a checklist for grant-funded device refreshes.\n\nRead the full issue online.\n\nNonprofit Tech Weekly',
      'Join us for a 45-minute webinar on secure remote work. The recording will be available afterwards.\n\nNonprofit Tech Weekly',
    ],
    replies: [],
    bulk: true,
  },
  {
    kind: 'grant',
    subjects: ['Grant reporting deadline: digital inclusion programme', 'Funder asks for data protection evidence', 'Volunteer laptop allocation for the new cohort'],
    bodies: [
      'Hi Priya,\n\nThe funder has asked for a short technology section in the report. Can you confirm the number of devices and the backup arrangements by {when}?\n\nDaniel',
      'We need to show evidence of our data protection training for the grant audit. Do you have the completion list for the last cohort?\n\nDaniel',
    ],
    replies: ['I have the device list; I will send it this afternoon.', 'The training completion export is in the shared grants folder.'],
  },
  {
    kind: 'hr',
    subjects: ['Access review for leavers this month', 'New volunteer onboarding — IT checklist', 'Hybrid working equipment request'],
    bodies: [
      'Hi Priya,\n\nPlease complete the access review for this month’s leavers. I have flagged two accounts that still have mailbox delegation.\n\nAisha',
      'Can you confirm the IT checklist for the new volunteers starting Monday? I want to make sure they can access the shared inbox.\n\nAisha',
    ],
    replies: ['Access removed for both accounts. I will confirm the delegation cleanup.', 'Checklist is ready; the service desk will run it Friday.'],
  },
  {
    kind: 'social',
    subjects: ['Lunch after the all-hands?', 'Photos from the volunteer day', 'Coffee next week?'],
    bodies: [
      'A few of us are going for lunch after the all-hands. Want to join?\n\nAlex',
      'I put the volunteer day photos in the shared drive. Some good ones of the new laptops in action.\n\nAlex',
    ],
    replies: ['Count me in.', 'Thanks — I will take a look.'],
  },
]

const REPLY_FROM = PEOPLE.filter((p) => p.email.endsWith('@brightsteps.example'))

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)]
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const pad = (n) => String(n).padStart(2, '0')
const dateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)

export function resolveRange({ days, weeks, months, start, end, now = new Date() }) {
  let from
  let to
  if (start || end) {
    if (!start || !end) throw new Error('Use both --start and --end (YYYY-MM-DD).')
    from = startOfDay(new Date(`${start}T00:00:00`))
    to = startOfDay(new Date(`${end}T00:00:00`))
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()))
      throw new Error('Dates must use YYYY-MM-DD.')
    if (to < from) throw new Error('--end must be on or after --start.')
  } else {
    const n = Number(days ?? (weeks ? weeks * 7 : months ? null : 3))
    if (months) {
      to = startOfDay(now)
      from = new Date(to)
      from.setMonth(from.getMonth() - Number(months))
      from = startOfDay(from)
    } else {
      if (!Number.isFinite(n) || n < 1 || n > 3660) throw new Error('The period must be between 1 day and 10 years.')
      to = startOfDay(now)
      from = new Date(to)
      from.setDate(from.getDate() - (Math.round(n) - 1))
    }
  }
  const totalDays = Math.round((to - from) / 86400000) + 1
  return { start: from, end: to, days: totalDays }
}

function formatAmount(rng) {
  const amount = int(rng, 40, 4800)
  return `$${amount.toLocaleString('en-US')}.00`
}

function bodyFor(template, person, rng) {
  const when = `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][int(rng, 0, 4)]} at ${int(rng, 8, 16)}:00`
  return template
    .replaceAll('{name}', person.name.split(' ')[0])
    .replaceAll('{ask}', pick(rng, ['a licence for the design laptop', 'access to the shared grants folder', 'a replacement headset', 'a new Teams phone number']))
    .replaceAll('{topic}', pick(rng, ['the backup service', 'the device refresh', 'the donor platform', 'our remote access setup']))
    .replaceAll('{vendor}', pick(rng, ['Northwind ISP', 'CloudBackup', 'DonorFlow', 'Microsoft 365']))
    .replaceAll('{amount}', formatAmount(rng))
    .replaceAll('{period}', pick(rng, ['October', 'the next quarter', 'the annual renewal']))
    .replaceAll('{when}', when)
}

function signature(person) {
  return `\n\n${person.name}\n${person.role}\n${PERSONA.org}`
}

function makeThread(rng, day, index, targetMessages) {
  const topic = pick(rng, TOPICS)
  const sender = pick(rng, REPLY_FROM.filter((p) => p.email !== PERSONA.email))
  const subject = pick(rng, topic.subjects)
  const base = new Date(day)
  base.setHours(int(rng, 7, 17), int(rng, 0, 59), 0, 0)
  const rootId = `<demo-${day.getTime()}-${index}-root@sentinel-demo.local>`
  const size = Math.min(int(rng, topic.replies.length ? 1 : 1, topic.replies.length ? 4 : 1), targetMessages)
  const messages = []
  const body = bodyFor(pick(rng, topic.bodies), sender, rng) + signature(sender)
  messages.push({
    id: rootId,
    threadId: rootId,
    from: sender,
    to: [{ name: PERSONA.name, email: PERSONA.email }],
    cc: rng() > 0.75 ? [pick(rng, PEOPLE.filter((p) => p.email !== PERSONA.email)).email] : [],
    subject,
    date: base,
    body,
    kind: topic.kind,
    references: [],
    bulk: Boolean(topic.bulk),
    auto: Boolean(topic.auto),
  })
  let previous = messages[0]
  for (let i = 1; i < size; i++) {
    const responder = rng() > 0.5 ? pick(rng, REPLY_FROM.filter((p) => p.email !== previous.from.email)) : sender
    const replyDate = new Date(previous.date.getTime() + int(rng, 20, 420) * 60_000)
    const replyBody = `${pick(rng, topic.replies)}\n\nOn ${previous.date.toDateString()}, ${previous.from.name} wrote:\n> ${previous.body.split('\n')[0]}\n${signature(responder)}`
    const id = `<demo-${day.getTime()}-${index}-${i}@sentinel-demo.local>`
    const msg = {
      id,
      threadId: rootId,
      from: responder,
      to: [{ name: previous.from.name, email: previous.from.email }],
      cc: [],
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      date: replyDate,
      body: replyBody,
      kind: 'work',
      references: [...previous.references, previous.id],
      bulk: false,
      auto: false,
    }
    messages.push(msg)
    previous = msg
  }
  return messages
}

/** Generate messages for every day in the range. Deterministic for a seed. */
export function planMessages({ range, perDay = 35, seed = 20261106 }) {
  const rng = mulberry32(seed)
  const messages = []
  let sequence = 0
  for (let d = 0; d < range.days; d++) {
    const day = new Date(range.start)
    day.setDate(day.getDate() + d)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    let target = Math.max(2, Math.round(perDay * (weekend ? 0.22 : 0.75 + rng() * 0.5)))
    while (target > 0) {
      const thread = makeThread(rng, day, sequence++, target)
      messages.push(...thread)
      target -= thread.length
    }
  }
  messages.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id))
  return { messages, seed }
}

const encodeHeader = (value) => {
  const s = String(value ?? '')
  if (/^[\x20-\x7e]*$/.test(s)) return s
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}
const fold = (name, value) => {
  const line = `${name}: ${value}`
  if (line.length <= 78) return line
  return `${line.slice(0, 78)}\r\n ${line.slice(78)}`
}
const address = (a) => (a.name ? `${encodeHeader(a.name)} <${a.email}>` : a.email)
const base64 = (text) => Buffer.from(String(text), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')

function htmlFor(body) {
  return `<!doctype html><html><body>${body
    .split('\n')
    .map((line) => (line ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : ''))
    .join('')}</body></html>`
}

export function buildMime(message) {
  const boundary = `sentinel-${createHash('sha1').update(message.id).digest('hex').slice(0, 12)}`
  const headers = [
    fold('From', address(message.from)),
    fold('To', message.to.map(address).join(', ')),
    ...(message.cc?.length ? [fold('Cc', message.cc.join(', '))] : []),
    fold('Subject', encodeHeader(message.subject)),
    `Date: ${message.date.toUTCString()}`,
    `Message-ID: ${message.id}`,
    ...(message.references?.length ? [`In-Reply-To: ${message.references.at(-1)}`] : []),
    ...(message.references?.length ? [fold('References', message.references.join(' '))] : []),
    'MIME-Version: 1.0',
    ...(message.bulk ? ['List-Unsubscribe: <mailto:unsubscribe@nonprofit-tech.example>', 'Precedence: bulk'] : []),
    ...(message.auto ? ['Auto-Submitted: auto-generated'] : []),
    'X-Sentinel-Demo: true',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(message.body),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(htmlFor(message.body)),
    `--${boundary}--`,
    '',
  ].join('\r\n')
  return `${headers.join('\r\n')}\r\n${body}`
}

const mboxEscape = (message) => message.replace(/^From /gm, '>From ')

export function mboxFrom(messages) {
  return messages
    .map((message) => {
      const from = `${message.from.email} ${message.date.toUTCString()}`
      return `From ${from}\nX-Mozilla-Status: 0001\nX-Mozilla-Status2: 00000000\n${mboxEscape(buildMime(message))}\n`
    })
    .join('\n')
}

export function writeOutput(outDir, messages, range, seed) {
  const emlDir = join(outDir, 'eml')
  mkdirSync(emlDir, { recursive: true })
  for (const message of messages) {
    const stamp = `${dateOnly(message.date)}-${message.id.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')}.eml`
    writeFileSync(join(emlDir, stamp), buildMime(message), 'utf8')
  }
  const mboxPath = join(outDir, 'sentinel-demo.mbox')
  writeFileSync(mboxPath, mboxFrom(messages), 'utf8')
  const summary = {
    generatedAt: new Date().toISOString(),
    start: dateOnly(range.start),
    end: dateOnly(range.end),
    days: range.days,
    messages: messages.length,
    threads: new Set(messages.map((m) => m.threadId)).size,
    seed,
    persona: PERSONA,
    mbox: mboxPath,
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return summary
}

function parseProfilesIni(text) {
  const sections = {}
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const section = /^\[(.+)]$/.exec(line.trim())
    if (section) {
      current = section[1]
      sections[current] = {}
    } else if (current && line.includes('=')) {
      const [key, ...rest] = line.split('=')
      sections[current][key.trim()] = rest.join('=').trim()
    }
  }
  return sections
}

/** Find likely Thunderbird profile directories. */
export function profileCandidates(env = process.env, home = homedir(), os = platform()) {
  const roots = []
  if (env.THUNDERBIRD_PROFILE) roots.push(resolve(env.THUNDERBIRD_PROFILE))
  if (os === 'darwin') roots.push(join(home, 'Library/Thunderbird'))
  else if (os === 'win32') roots.push(join(env.APPDATA ?? join(home, 'AppData/Roaming'), 'Thunderbird'))
  else {
    roots.push(join(home, '.thunderbird'))
    roots.push(join(home, '.var/app/org.mozilla.Thunderbird/.thunderbird'))
    roots.push(join(home, 'snap/thunderbird/common/.thunderbird'))
  }
  const out = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    if (statSync(root).isDirectory() && existsSync(join(root, 'prefs.js'))) {
      out.push(root)
      continue
    }
    const ini = join(root, 'profiles.ini')
    if (!existsSync(ini)) continue
    const sections = parseProfilesIni(readFileSync(ini, 'utf8'))
    for (const [name, values] of Object.entries(sections)) {
      if (!name.startsWith('Profile')) continue
      const path = values.Path
      if (!path) continue
      const dir = values.IsRelative === '1' ? join(root, path) : path
      if (existsSync(dir)) out.push(dir)
    }
  }
  return [...new Set(out)]
}

export function findProfile(explicit) {
  if (explicit) {
    const dir = resolve(explicit)
    if (!existsSync(dir)) throw new Error(`Thunderbird profile not found: ${dir}`)
    return dir
  }
  const found = profileCandidates()
  if (!found.length) throw new Error('No Thunderbird profile found. Pass --profile /path/to/profile.')
  return found[0]
}

export function sanitizeFolder(name = 'Sentinel Demo') {
  const clean = String(name).replace(/[\\/]/g, '-').replace(/^\.+/, '').trim()
  if (!clean) throw new Error('The folder name cannot be empty.')
  return clean
}

function thunderbirdRunning(profileDir) {
  return ['parent.lock', 'lock'].some((name) => existsSync(join(profileDir, name)))
}

/** Append the generated mbox to a Local Folders mailbox. Thunderbird must be closed. */
export function installToThunderbird(profileDir, mboxText, { folder = 'Sentinel Demo', replace = false } = {}) {
  if (thunderbirdRunning(profileDir))
    throw new Error('Close Thunderbird before --apply; a profile lock is present.')
  const safe = sanitizeFolder(folder)
  const local = join(profileDir, 'Mail', 'Local Folders')
  mkdirSync(local, { recursive: true })
  const target = join(local, safe)
  const prefix = existsSync(target) && !replace ? `${readFileSync(target, 'utf8').replace(/\n*$/, '\n\n')}` : ''
  writeFileSync(target, prefix + mboxText, 'utf8')
  const msf = `${target}.msf`
  if (existsSync(msf)) rmSync(msf)
  return { path: target, folder: safe, appended: Boolean(prefix) }
}

const HELP = `Generate demo email for a busy non-profit IT inbox.

Usage:
  node tools/generate-demo-mail.mjs [options]
  npm run demo:mail -- [options]

Period (choose one):
  --days N              Last N days ending today (default 3)
  --weeks N             Last N weeks
  --months N            Last N calendar months
  --start YYYY-MM-DD    Range start (requires --end)
  --end YYYY-MM-DD      Range end (inclusive)

Content:
  --per-day N           Average messages per weekday (default 35)
  --seed N              Deterministic seed (default 20261106)
  --out DIR             Output directory (default demo-mail)

Thunderbird:
  --apply               Append the generated mbox to a Local Folders mailbox
  --folder NAME         Local folder name (default "Sentinel Demo")
  --profile DIR         Thunderbird profile directory (auto-detected otherwise)
  --replace             Replace the target folder instead of appending
  --help                Show this help

Close Thunderbird before --apply. The generated messages are synthetic; do not send them.
`

export function parseArgs(argv = []) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v == null || v.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      return v
    }
    switch (arg) {
      case '--days': opts.days = Number(value()); break
      case '--weeks': opts.weeks = Number(value()); break
      case '--months': opts.months = Number(value()); break
      case '--start': opts.start = value(); break
      case '--end': opts.end = value(); break
      case '--per-day': opts.perDay = Number(value()); break
      case '--seed': opts.seed = Number(value()); break
      case '--out': opts.out = value(); break
      case '--folder': opts.folder = value(); break
      case '--profile': opts.profile = value(); break
      case '--apply': opts.apply = true; break
      case '--replace': opts.replace = true; break
      case '--help': opts.help = true; break
      default: throw new Error(`Unknown option: ${arg}`)
    }
  }
  if ([opts.days, opts.weeks, opts.months].filter((n) => n != null).length > 1)
    throw new Error('Use only one of --days, --weeks or --months.')
  if ((opts.start && !opts.end) || (!opts.start && opts.end))
    throw new Error('Use both --start and --end.')
  if (!opts.perDay || opts.perDay < 1) opts.perDay = 35
  if (!opts.seed) opts.seed = 20261106
  return opts
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  if (opts.help) {
    console.log(HELP)
    return { help: true }
  }
  const range = resolveRange(opts)
  const { messages } = planMessages({ range, perDay: opts.perDay, seed: opts.seed })
  const outDir = resolve(opts.out ?? 'demo-mail')
  const summary = writeOutput(outDir, messages, range, opts.seed)
  console.log(`Generated ${summary.messages} messages in ${summary.threads} threads for ${summary.start} → ${summary.end}.`)
  console.log(`Output: ${outDir}`)
  if (opts.apply) {
    const profile = findProfile(opts.profile)
    const installed = installToThunderbird(profile, mboxFrom(messages), {
      folder: opts.folder,
      replace: opts.replace,
    })
    console.log(`Installed into ${installed.path}${installed.appended ? ' (appended)' : ''}.`)
    console.log('Start Thunderbird and open Local Folders → ' + installed.folder + '.')
  } else {
    console.log('To install in Thunderbird: close Thunderbird, then rerun with --apply.')
  }
  return summary
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main().catch((error) => {
    console.error(`demo-mail: ${error.message}`)
    process.exitCode = 1
  })
}
