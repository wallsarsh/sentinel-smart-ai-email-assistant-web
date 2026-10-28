import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import { defaultSettings, parseSettingsPatch } from '../../shared/settings'

describe('sending settings', () => {
  it('safe defaults: 5 s undo, step-up on, placeholders blocked, external warned', () => {
    const d = defaultSettings()
    expect([
      d['send.undoSeconds'],
      d['send.requireStepUp'],
      d['send.blockOnPlaceholders'],
      d['send.warnExternalRecipients'],
    ]).toEqual([5, true, true, true])
    expect(d['send.dailyLimit']).toBe(50)
  })
  it('the settings API accepts valid values and rejects out-of-range ones', () => {
    expect(parseSettingsPatch({ 'send.undoSeconds': 30, 'send.dailyLimit': 0 }).ok).toBe(true)
    for (const bad of [
      { 'send.undoSeconds': 31 },
      { 'send.undoSeconds': -1 },
      { 'send.dailyLimit': 1001 },
      { 'send.requireStepUp': 'yes' },
    ])
      expect(parseSettingsPatch(bad).ok, JSON.stringify(bad)).toBe(false)
  })
  it('the page wires every setting, the status labels cover all states, and the log shows no content columns', () => {
    const src = readFileSync('app/pages/settings/sending.vue', 'utf8')
    for (const k of [
      'send.undoSeconds',
      'send.requireStepUp',
      'send.blockOnPlaceholders',
      'send.warnExternalRecipients',
      'send.dailyLimit',
    ])
      expect(src).toContain(k)
    for (const st of ['pending', 'submitting', 'sent', 'failed', 'unknown', 'cancelled'])
      expect(en.sending.status).toHaveProperty(st)
    expect(src).not.toMatch(/subject|bodyText|address/i)
    const api = readFileSync('server/api/send/log.get.ts', 'utf8')
    expect(api).not.toMatch(/subject|bodyText|contentHash|internetMessageId/)
  })
})
