import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
// @ts-expect-error plain JS modules
import * as lib from '../../installer/lib.mjs'
// @ts-expect-error plain JS modules
import { buildXpi } from '../../installer/package-xpi.mjs'

const redirect = (location: string, status = 302) =>
  ({ status, ok: false, headers: new Headers({ location }) }) as Response

describe('installer arguments and platform', () => {
  it('parses options and rejects bad ones', () => {
    expect(lib.parseArgs(['--channel', 'release', '--no-launch', '--dry-run'])).toMatchObject({ channel: 'release', launch: false, dryRun: true })
    expect(() => lib.parseArgs(['--channel', 'nightly'])).toThrow()
    expect(() => lib.parseArgs(['--dir'])).toThrow('needs a value')
    expect(() => lib.parseArgs(['--bogus'])).toThrow('Unknown option')
    expect(() => lib.parseArgs(['--lang', '../x'])).toThrow()
  })
  it('maps platforms and refuses unknown ones', () => {
    expect(lib.mozillaOs('linux', 'x64')).toBe('linux64')
    expect(lib.mozillaOs('darwin', 'arm64')).toBe('osx')
    expect(lib.mozillaOs('win32', 'x64')).toBe('win64')
    expect(() => lib.mozillaOs('linux', 'arm64')).toThrow('--use-system')
  })
})

describe('download resolution and verification', () => {
  const opts = { channel: 'esr', os: 'linux64', lang: 'en-US' }
  it('follows Mozilla’s redirect and only trusts Mozilla hosts', async () => {
    const ok = await lib.resolveDownload(opts, async () => redirect('https://download-installer.cdn.mozilla.net/pub/thunderbird/releases/140.5.0esr/linux-x86_64/en-US/thunderbird-140.5.0esr.tar.xz'))
    expect(ok).toMatchObject({ version: '140.5.0esr', key: 'linux-x86_64/en-US/thunderbird-140.5.0esr.tar.xz', file: 'thunderbird-140.5.0esr.tar.xz' })
    await expect(lib.resolveDownload(opts, async () => redirect('https://evil.example/pub/thunderbird/releases/1/x/y.tar.xz'))).rejects.toThrow('Refusing')
    await expect(lib.resolveDownload(opts, async () => redirect('http://download.mozilla.net/pub/thunderbird/releases/1/x/y'))).rejects.toThrow('Refusing')
    await expect(lib.resolveDownload(opts, async () => ({ status: 200, headers: new Headers() }) as Response)).rejects.toThrow('did not return')
  })
  it('reads published checksums and fails closed when there is none', async () => {
    const sums = `${'a'.repeat(128)}  linux-x86_64/en-US/thunderbird-1.tar.xz\n${'b'.repeat(128)}  win64/en-US/Thunderbird Setup 1.exe\n`
    const f = async () => ({ ok: true, text: async () => sums }) as Response
    expect(await lib.expectedChecksum({ version: '1', key: 'linux-x86_64/en-US/thunderbird-1.tar.xz' }, f)).toEqual({ algo: 'sha512', hex: 'a'.repeat(128) })
    expect((await lib.expectedChecksum({ version: '1', key: 'win64/en-US/Thunderbird Setup 1.exe' }, f)).hex).toBe('b'.repeat(128))
    await expect(lib.expectedChecksum({ version: '1', key: 'nope' }, f)).rejects.toThrow('unverified')
    await expect(lib.expectedChecksum({ version: '1', key: 'x' }, async () => ({ ok: false }) as Response)).rejects.toThrow('unverified')
  })
  it('hashes files', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sum-')), 'f')
    writeFileSync(file, 'hello')
    expect(await lib.sha(file, 'sha256')).toBe(createHash('sha256').update('hello').digest('hex'))
  })
})

describe('profile handling', () => {
  const ini = `[Install1]\nDefault=Profiles/abc.default\n[Profile1]\nName=other\nIsRelative=1\nPath=Profiles/zzz.other\n[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abc.default-release\nDefault=1\n`
  it('finds the default profile', () => {
    expect(lib.defaultProfileFromIni(ini, '/r')).toBe('/r/Profiles/abc.default-release')
    expect(lib.defaultProfileFromIni('[Profile0]\nIsRelative=0\nPath=/abs/p\n', '/r')).toBe('/abs/p')
    expect(lib.defaultProfileFromIni('', '/r')).toBeNull()
  })
  it('merges user.js idempotently and keeps the user’s own prefs', () => {
    const once = lib.mergeUserJs('user_pref("a", 1);')
    expect(once).toContain('user_pref("a", 1);')
    expect(once).toContain('xpinstall.signatures.required')
    expect(lib.mergeUserJs(once)).toBe(once)
  })
  it('chooses per-user locations', () => {
    expect(lib.paths('linux', {}, '/home/u').data).toBe('/home/u/.local/share/sentinel-thunderbird')
    expect(lib.paths('linux', { XDG_DATA_HOME: '/x' }, '/home/u').data).toBe('/x/sentinel-thunderbird')
    expect(lib.paths('darwin', {}, '/Users/u').profilesRoot).toBe('/Users/u/Library/Thunderbird')
  })
})

describe('add-on package', () => {
  it('zips the manifest, built files and experiment API', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'xpi-')), 'a.xpi')
    const { files } = buildXpi(process.cwd(), out, { build: false })
    const zip = unzipSync(new Uint8Array(readFileSync(out)))
    expect(Object.keys(zip)).toEqual(files)
    for (const f of ['manifest.json', 'dist/background.js', 'dist/options.html', 'experiments/sentinel-calendar/schema.json']) expect(zip[f]).toBeDefined()
    expect(JSON.parse(new TextDecoder().decode(zip['manifest.json'])).browser_specific_settings.gecko.id).toBe(lib.ADDON_ID)
  })
})
