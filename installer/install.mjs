#!/usr/bin/env node
// Downloads Thunderbird (checksum-verified), installs it per-user and installs the Sentinel AI add-on.
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, renameSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline/promises'
import {
  ADDON_ID, HELP, defaultProfileFromIni, desktopEntry, expectedChecksum, launcherScript,
  mergeUserJs, mozillaOs, parseArgs, paths, resolveDownload, sha,
} from './lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (m) => console.log(`• ${m}`)
const os = process.platform

async function ask(question, assumeYes) {
  if (assumeYes) return true
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase()
  rl.close()
  return a === 'y' || a === 'yes'
}

const appBinary = (dir) =>
  os === 'win32' ? join(dir, 'app', 'thunderbird.exe')
  : os === 'darwin' ? join(dir, 'app', 'Thunderbird.app', 'Contents', 'MacOS', 'thunderbird')
  : join(dir, 'app', 'thunderbird', 'thunderbird')

function findSystemThunderbird() {
  const candidates = os === 'win32'
    ? ['C:\\Program Files\\Mozilla Thunderbird\\thunderbird.exe']
    : os === 'darwin' ? ['/Applications/Thunderbird.app/Contents/MacOS/thunderbird']
    : ['/usr/bin/thunderbird', '/usr/local/bin/thunderbird', '/opt/thunderbird/thunderbird', '/usr/lib/thunderbird/thunderbird']
  const found = candidates.find((c) => existsSync(c))
  if (found) return found
  if (os !== 'win32') {
    try { return execFileSync('which', ['thunderbird'], { encoding: 'utf8' }).trim() || null } catch { /* not on PATH */ }
  }
  return null
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  let got = 0
  let last = 0
  const body = Readable.fromWeb(res.body)
  body.on('data', (c) => {
    got += c.length
    if (total && Date.now() - last > 500) {
      last = Date.now()
      process.stdout.write(`\r  ${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`)
    }
  })
  await pipeline(body, createWriteStream(dest))
  if (total) process.stdout.write('\n')
}

function extract(file, appDir, work) {
  mkdirSync(appDir, { recursive: true })
  if (os === 'linux') {
    execFileSync('tar', ['-xf', file, '-C', appDir], { stdio: 'inherit' }) // tar handles .xz and .bz2
  } else if (os === 'darwin') {
    const mount = join(work, 'mnt')
    mkdirSync(mount)
    execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, file], { stdio: 'inherit' })
    try {
      execFileSync('ditto', [join(mount, 'Thunderbird.app'), join(appDir, 'Thunderbird.app')], { stdio: 'inherit' })
    } finally {
      execFileSync('hdiutil', ['detach', mount], { stdio: 'ignore' })
    }
  } else {
    // Mozilla's silent switch; installs for the current user into the folder given.
    execFileSync(file, ['/S', `/InstallDirectoryPath=${appDir}`], { stdio: 'inherit' })
  }
}

function profileLocked(dir) {
  if (os === 'win32') return false
  for (const n of ['lock', '.parentlock']) {
    try { lstatSync(join(dir, n)); return true } catch { /* absent */ }
  }
  return false
}

function installAddon(profile, xpi) {
  mkdirSync(join(profile, 'extensions'), { recursive: true })
  const target = join(profile, 'extensions', `${ADDON_ID}.xpi`)
  copyFileSync(xpi, target + '.new')
  if (existsSync(target)) copyFileSync(target, join(profile, 'sentinel-previous.xpi'))
  renameSync(target + '.new', target)
  const userJs = join(profile, 'user.js')
  writeFileSync(userJs, mergeUserJs(existsSync(userJs) ? readFileSync(userJs, 'utf8') : ''))
}

async function getXpi(opts, work) {
  if (opts.xpi) {
    if (!existsSync(opts.xpi)) throw new Error(`Add-on package not found: ${opts.xpi}`)
    return resolve(opts.xpi)
  }
  const prebuilt = join(root, 'installer', 'sentinel-ai.xpi')
  if (existsSync(prebuilt)) return prebuilt
  log('Building the Sentinel add-on package…')
  const { buildXpi } = await import('./package-xpi.mjs')
  return buildXpi(root, join(work, 'sentinel-ai.xpi')).out
}

async function uninstall(opts) {
  const { data } = paths()
  const dir = resolve(opts.dir ?? data)
  const targets = [join(dir, 'app')]
  if (os === 'linux') {
    const home = process.env.HOME
    targets.push(join(home, '.local/bin/sentinel-thunderbird'), join(home, '.local/share/applications/sentinel-thunderbird.desktop'))
  }
  const profile = opts.profileDir ? resolve(opts.profileDir) : join(dir, 'profile')
  targets.push(join(profile, 'extensions', `${ADDON_ID}.xpi`))
  for (const t of targets) {
    if (!existsSync(t)) continue
    log(`${opts.dryRun ? 'Would remove' : 'Removing'} ${t}`)
    if (!opts.dryRun) rmSync(t, { recursive: true, force: true })
  }
  log(`Your mail profile was not touched: ${profile}`)
  if (!opts.profileDir) log('Delete it yourself when you no longer need its settings and local mail.')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return console.log(HELP)
  if (opts.uninstall) return uninstall(opts)
  const { data, profilesRoot } = paths()
  const dir = resolve(opts.dir ?? data)
  const work = mkdtempSync(join(tmpdir(), 'sentinel-install-'))
  try {
    // 1. Thunderbird itself
    let app
    if (opts.useSystem) {
      app = findSystemThunderbird()
      if (!app) throw new Error('No Thunderbird found. Remove --use-system to download it.')
      log(`Using the Thunderbird at ${app}`)
    } else {
      const target = mozillaOs()
      const info = await resolveDownload({ channel: opts.channel, os: target, lang: opts.lang })
      log(`Latest ${opts.channel.toUpperCase()}: Thunderbird ${info.version} (${info.file})`)
      app = appBinary(dir)
      if (opts.dryRun) log(`Would download ${info.url} and install to ${join(dir, 'app')}`)
      else if (existsSync(app)) log(`Thunderbird already installed at ${app}; re-run with a new --dir to reinstall.`)
      else {
        const expected = await expectedChecksum(info)
        const file = join(work, info.file)
        log('Downloading…')
        await download(info.url, file)
        log(`Verifying ${expected.algo.toUpperCase()} checksum…`)
        if ((await sha(file, expected.algo)) !== expected.hex) throw new Error('Checksum mismatch — the download was discarded.')
        log('Installing Thunderbird…')
        extract(file, join(dir, 'app'), work)
        if (!existsSync(app)) throw new Error('Thunderbird was extracted but its program was not found.')
      }
      if (opts.channel !== 'esr') console.log('! The release channel refuses unsigned add-ons; Sentinel may stay disabled. Use --channel esr.')
    }

    // 2. Profile
    let profile = opts.profileDir ? resolve(opts.profileDir) : null
    if (!profile) {
      const iniPath = join(profilesRoot, 'profiles.ini')
      const existing = existsSync(iniPath) ? defaultProfileFromIni(readFileSync(iniPath, 'utf8'), profilesRoot) : null
      if (existing && existsSync(existing) &&
        await ask(`Install into your existing Thunderbird profile (${existing})?\n  This turns off add-on signature checking in that profile.`, false))
        profile = existing
      else profile = join(dir, 'profile')
    }
    log(`Profile: ${profile}`)
    if (opts.dryRun) return log('Dry run — nothing was changed.')
    if (profileLocked(profile)) throw new Error('That profile is open in Thunderbird. Close Thunderbird and run the installer again.')
    mkdirSync(profile, { recursive: true })

    // 3. The add-on
    installAddon(profile, await getXpi(opts, work))
    log('Sentinel AI add-on installed.')

    // 4. Launcher
    let launcher = app
    if (os === 'linux') {
      const home = process.env.HOME
      launcher = join(home, '.local/bin/sentinel-thunderbird')
      mkdirSync(dirname(launcher), { recursive: true })
      writeFileSync(launcher, launcherScript({ app, profile }))
      chmodSync(launcher, 0o755)
      const apps = join(home, '.local/share/applications')
      mkdirSync(apps, { recursive: true })
      const icon = join(dirname(app), 'chrome/icons/default/default128.png')
      writeFileSync(join(apps, 'sentinel-thunderbird.desktop'), desktopEntry({ launcher, icon: existsSync(icon) ? icon : '' }))
      log(`Launcher: ${launcher}  (also in your applications menu)`)
    }

    console.log('\nDone. Next steps:')
    console.log('  1. In Thunderbird add your mail account (if the profile is new).')
    console.log('  2. Open the Sentinel toolbar button → Provider settings, add your AI provider and choose a model.')
    if (os !== 'linux') console.log(`  Start it with: "${app}" --profile "${profile}"`)
    if (opts.launch) {
      log('Starting Thunderbird…')
      spawn(app, ['--profile', profile], { detached: true, stdio: 'ignore' }).unref()
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exit(1)
})
