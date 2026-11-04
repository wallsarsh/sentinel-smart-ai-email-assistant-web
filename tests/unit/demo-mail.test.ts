import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM tool script
import {
  buildMime,
  installToThunderbird,
  mboxFrom,
  planMessages,
  profileCandidates,
  resolveRange,
  sanitizeFolder,
} from '../../tools/generate-demo-mail.mjs'

const now = new Date(2026, 10, 4, 12, 0, 0)

describe('demo mail period', () => {
  it('resolves days, weeks and months inclusively', () => {
    expect(resolveRange({ days: 3, now })).toMatchObject({ days: 3 })
    expect(resolveRange({ weeks: 2, now })).toMatchObject({ days: 14 })
    expect(resolveRange({ months: 1, now }).days).toBeGreaterThanOrEqual(28)
    expect(resolveRange({ start: '2026-10-01', end: '2026-10-03' })).toMatchObject({ days: 3 })
    expect(() => resolveRange({ start: '2026-10-03', end: '2026-10-01' })).toThrow(/end/)
  })
})

describe('demo mail generation', () => {
  const range = resolveRange({ days: 2, now })
  const { messages } = planMessages({ range, perDay: 8, seed: 7 })

  it('is deterministic and creates conversations with threading headers', () => {
    const second = planMessages({ range, perDay: 8, seed: 7 }).messages
    expect(messages.map((m: { id: string }) => m.id)).toEqual(second.map((m: { id: string }) => m.id))
    expect(messages.length).toBeGreaterThan(4)
    const threads = new Map<string, { id: string; references: string[] }[]>()
    for (const m of messages) {
      const list = threads.get(m.threadId) ?? []
      list.push(m)
      threads.set(m.threadId, list)
    }
    expect([...threads.values()].some((t) => t.length > 1)).toBe(true)
    for (const thread of threads.values())
      for (const m of thread.slice(1)) expect(m.references).toContain(thread[0].id)
  })

  it('builds a threaded MIME message and a usable mbox', () => {
    const withThread = messages.find((m: { references: string[] }) => m.references.length > 0)
    const raw = buildMime(withThread)
    expect(raw).toContain('MIME-Version: 1.0')
    expect(raw).toContain('In-Reply-To:')
    expect(raw).toContain('References:')
    expect(raw).toContain('Content-Type: multipart/alternative')
    const bulk = messages.find((m: { bulk: boolean }) => m.bulk)
    if (bulk) expect(buildMime(bulk)).toContain('List-Unsubscribe:')
    const mbox = mboxFrom(messages)
    expect(mbox.startsWith('From ')).toBe(true)
    expect(mbox).toContain('X-Mozilla-Status: 0001')
    expect(mbox.split('\nFrom ').length).toBeGreaterThan(1)
  })
})

describe('demo mail Thunderbird install', () => {
  it('finds a profile from THUNDERBIRD_PROFILE and writes a Local Folders mbox', () => {
    const profile = mkdtempSync(join(tmpdir(), 'sentinel-tb-'))
    writeFileSync(join(profile, 'prefs.js'), '')
    expect(profileCandidates({ THUNDERBIRD_PROFILE: profile }, tmpdir(), 'linux')).toContain(profile)
    const out = installToThunderbird(profile, 'From demo\nX-Mozilla-Status: 0001\n\nbody\n', {
      folder: 'Sentinel Demo',
    })
    expect(out.folder).toBe('Sentinel Demo')
    expect(existsSync(out.path)).toBe(true)
    expect(readFileSync(out.path, 'utf8')).toContain('X-Mozilla-Status')
    expect(existsSync(`${out.path}.msf`)).toBe(false)
    expect(sanitizeFolder('../bad/name')).toBe('..-bad-name'.replace(/^\.+/, ''))
  })

  it('refuses to write while Thunderbird holds the profile lock', () => {
    const profile = mkdtempSync(join(tmpdir(), 'sentinel-tb-lock-'))
    writeFileSync(join(profile, 'parent.lock'), '')
    expect(() => installToThunderbird(profile, 'From demo\n\nbody\n')).toThrow(/Close Thunderbird/)
  })
})
