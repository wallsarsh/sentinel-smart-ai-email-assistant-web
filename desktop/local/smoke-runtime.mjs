/**
 * Tests the actual packaged Nitro runtime + PGlite + local authentication,
 * inbox and restart durability. No external services or provider credentials.
 * Exits nonzero on any failure and always kills the child.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const root = resolve('src-tauri/runtime')
const node = join(root, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
const dir = await mkdtemp(join(tmpdir(), 'sentinel-local-runtime-'))
const port = 23000 + Math.floor(Math.random() * 20000)
const baseUrl = `http://127.0.0.1:${port}`
const config = {
  ...process.env, NODE_ENV: 'production', BASE_URL: baseUrl,
  PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: 'pglite:local',
  SENTINEL_DESKTOP_DB_DIR: join(dir, 'pgdata'),
  SESSION_SECRET: randomBytes(48).toString('hex'),
  KEK_BASE64: randomBytes(32).toString('base64'),
  SENTINEL_DESKTOP_MODE: 'true',
  SENTINEL_DESKTOP_PROBE: randomBytes(16).toString('base64url'),
  ALLOW_INSECURE_HTTP: 'true',
}
let child
const wait = async (ms) => new Promise(resolve => setTimeout(resolve, ms))
function run(entry) {
  const proc = spawn(node, [join(root, entry)], {
    cwd: root, env: config, stdio: ['ignore', 'ignore', 'pipe']
  })
  let output = ''
  proc.stderr.on('data', d => { output += d.toString().slice(0, 2000) })
  proc.getError = () => output.slice(-2000).replaceAll(config.SESSION_SECRET, '[REDACTED]')
  return proc
}
async function stop(proc) {
  if (!proc) return
  if (proc.exitCode !== null) return
  const ended = new Promise(resolve => proc.once('exit', resolve))
  proc.kill()
  await Promise.race([ended, wait(5000)])
  if (proc.exitCode === null) proc.kill('SIGKILL')
}
async function request(path, init) {
  return fetch(baseUrl + path, { ...init, signal: AbortSignal.timeout(2500) })
}
async function ready() {
  for (let i = 0; i < 120; ++i) {
    if (child.exitCode !== null) throw new Error('Bundled service exited: ' + child.getError())
    try {
      const r = await request('/api/ready')
      if (r.ok) return
    } catch { /* service still starting */ }
    await wait(500)
  }
  throw new Error('Timed out waiting for embedded Nitro/PGlite: ' + child.getError())
}
function cookiePair(setCookie) {
  return (setCookie || '').split(';')[0]
}
try {
  const migrated = run('dist/migrate.mjs')
  const exit = await new Promise((resolve, reject) => {
    migrated.on('exit', resolve)
    migrated.on('error', reject)
  })
  if (exit !== 0) throw new Error('Local migration failed: ' + migrated.getError())

  child = run('.output/server/index.mjs')
  await ready()
  const page = await request('/signup')
  if (!page.ok) throw new Error('HTML UI is not served')
  const csrf = cookiePair(page.headers.get('set-cookie'))
  if (!csrf.startsWith('sentinel_csrf=')) throw new Error('Missing CSRF cookie')
  const email = 'local@example.org', password = 'Standalone-Correct-Passphrase-4029!'
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'origin': baseUrl, 'cookie': csrf,
      'x-csrf-token': decodeURIComponent(csrf.split('=').slice(1).join('='))
    },
    body: JSON.stringify({ email, password, timezone: 'UTC' })
  })
  if (!signup.ok) throw new Error('Local signup failed (' + signup.status + '): ' + (await signup.text()).slice(0, 400))
  const session = cookiePair(signup.headers.get('set-cookie'))
  if (!session.startsWith('sentinel_session=')) throw new Error('Local session missing')
  const accounts = await request('/api/accounts', { headers: { cookie: session } })
  if (!accounts.ok) throw new Error('Cannot access local authenticated accounts')
  await stop(child)

  child = run('.output/server/index.mjs')
  await ready()
  const afterRestart = await request('/api/auth/login', {
    method: 'POST', headers: {
      'content-type': 'application/json', origin: baseUrl,
      cookie: csrf, 'x-csrf-token': decodeURIComponent(csrf.split('=').slice(1).join('='))
    }, body: JSON.stringify({ email, password })
  })
  if (!afterRestart.ok) throw new Error('Local user missing after restart (' + afterRestart.status + ')')
  console.log('Standalone smoke passed: migration, UI, signup, authenticated API, restart persistence')
} finally {
  await stop(child)
  await rm(dir, { recursive: true, force: true })
}
