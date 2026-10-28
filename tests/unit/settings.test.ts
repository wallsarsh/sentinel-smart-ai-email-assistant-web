import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { users } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { defaultSettings, parseSettingsPatch, settingKeys } from '../../shared/settings'

let t: Awaited<ReturnType<typeof createTestDb>>
let a: string
let b: string
beforeAll(async () => {
  t = await createTestDb()
  const rows = await t.db
    .insert(users)
    .values([
      { email: 'a@x.test', passwordHash: 'h' },
      { email: 'b@x.test', passwordHash: 'h' },
    ])
    .returning()
  a = rows[0]!.id
  b = rows[1]!.id
})
afterAll(async () => t.close())

describe('settings schema', () => {
  it('every key has a valid default and the privacy-first values hold', () => {
    const d = defaultSettings()
    expect(Object.keys(d).sort()).toEqual([...settingKeys].sort())
    expect(d['notify.previews']).toBe(false)
    expect(d['bg.aiEnabled']).toBe(false)
    expect(d['telemetry.crashReports']).toBe(false)
    expect(d['send.requireStepUp']).toBe(true)
    expect(d['send.undoSeconds']).toBe(5)
    expect(d['brief.minutes']).toBe(450)
    expect(d['retention.days']).toBe(30)
  })

  it('validates values and rejects unknown keys without partial application', () => {
    expect(parseSettingsPatch({ 'send.undoSeconds': 10 })).toEqual({
      ok: true,
      value: { 'send.undoSeconds': 10 },
    })
    const bad = parseSettingsPatch({
      'send.undoSeconds': 99,
      nope: 1,
      'retention.days': 45,
      'notify.mode': 'x',
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(bad.errors).toEqual({
        'send.undoSeconds': 'invalid_value',
        nope: 'unknown_key',
        'retention.days': 'invalid_value',
        'notify.mode': 'invalid_value',
      })
  })
})

describe('settings repository', () => {
  it('returns defaults, stores changes per user, and ignores corrupt rows', async () => {
    const A = forUser(t.db, a).settings
    const B = forUser(t.db, b).settings
    expect((await A.all())['send.undoSeconds']).toBe(5)
    await A.setMany({ 'send.undoSeconds': 12, 'notify.mode': 'all' })
    expect(await A.get('send.undoSeconds')).toBe(12)
    expect(await B.get('send.undoSeconds')).toBe(5)
    await t.raw.query("update settings set value = '\"nonsense\"' where key = 'send.undoSeconds'")
    expect(await A.get('send.undoSeconds')).toBe(5)
    expect(await A.get('notify.mode')).toBe('all')
  })
})
