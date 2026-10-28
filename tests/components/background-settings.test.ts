// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import BackgroundSettings, {
  type BgSettings,
} from '../../app/components/settings/BackgroundSettings.vue'
import RunHistory from '../../app/components/settings/RunHistory.vue'
import { minutesToTime, timeToMinutes } from '../../app/utils/time-of-day'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const mocks = { $t: t }

const settings = (o: Partial<BgSettings> = {}): BgSettings => ({
  'bg.intervalMinutes': 15,
  'bg.aiEnabled': false,
  'notify.mode': 'important',
  'notify.previews': false,
  'notify.quietStart': null,
  'notify.quietEnd': null,
  'notify.mutedAccounts': [],
  'brief.minutes': 450,
  'brief.notify': false,
  ...o,
})
const accounts = [
  { id: 'a1', email: 'one@x.test' },
  { id: 'a2', email: 'two@x.test' },
]
const mk = (s = settings(), acc = accounts, attach = false) =>
  mount(BackgroundSettings, {
    props: { settings: s, accounts: acc },
    global: { mocks },
    attachTo: attach ? document.body : undefined,
  })
const last = (w: ReturnType<typeof mk>) => w.emitted('save')!.at(-1)![0]

describe('BackgroundSettings', () => {
  it('shows the current values with safe defaults (previews off, AI off)', () => {
    const w = mk()
    expect((w.get('[data-testid=interval]').element as HTMLSelectElement).value).toBe('15')
    expect((w.get('[data-testid=ai]').element as HTMLInputElement).checked).toBe(false)
    expect((w.get('[data-testid=previews]').element as HTMLInputElement).checked).toBe(false)
    expect((w.get('[data-testid=mode]').element as HTMLSelectElement).value).toBe('important')
    expect((w.get('[data-testid=brief-time]').element as HTMLInputElement).value).toBe('07:30')
    expect(w.find('[data-testid=quiet-start]').exists()).toBe(false)
  })

  it('emits only the changed setting', async () => {
    const w = mk()
    await w.get('[data-testid=interval]').setValue('60')
    expect(last(w)).toEqual({ 'bg.intervalMinutes': 60 })
    await w.get('[data-testid=ai]').setValue(true)
    expect(last(w)).toEqual({ 'bg.aiEnabled': true })
    await w.get('[data-testid=mode]').setValue('needs_reply')
    expect(last(w)).toEqual({ 'notify.mode': 'needs_reply' })
    await w.get('[data-testid=previews]').setValue(true)
    expect(last(w)).toEqual({ 'notify.previews': true })
    await w.get('[data-testid=brief-notify]').setValue(true)
    expect(last(w)).toEqual({ 'brief.notify': true })
    await w.get('[data-testid=brief-time]').setValue('06:05')
    expect(last(w)).toEqual({ 'brief.minutes': 365 })
  })

  it('quiet hours: turning on proposes 22:00–07:00, times edit, turning off clears both', async () => {
    const w = mk()
    await w.get('[data-testid=quiet]').setValue(true)
    expect(last(w)).toEqual({ 'notify.quietStart': 1320, 'notify.quietEnd': 420 })
    const on = mk(settings({ 'notify.quietStart': 1320, 'notify.quietEnd': 420 }))
    expect((on.get('[data-testid=quiet-start]').element as HTMLInputElement).value).toBe('22:00')
    await on.get('[data-testid=quiet-end]').setValue('08:15')
    expect(last(on)).toEqual({ 'notify.quietEnd': 495 })
    await on.get('[data-testid=quiet]').setValue(false)
    expect(last(on)).toEqual({ 'notify.quietStart': null, 'notify.quietEnd': null })
  })

  it('muting an account adds it to the list and unmuting removes only it', async () => {
    const w = mk(settings({ 'notify.mutedAccounts': ['a2'] }))
    await w.get('[data-testid=mute-a1]').setValue(true)
    expect(last(w)).toEqual({ 'notify.mutedAccounts': ['a2', 'a1'] })
    await w.get('[data-testid=mute-a2]').setValue(false)
    expect(last(w)).toEqual({ 'notify.mutedAccounts': [] })
  })

  it('offers per-account muting only with more than one account', () => {
    expect(mk(settings(), accounts.slice(0, 1)).find('[data-testid=mute-a1]').exists()).toBe(false)
  })

  it('has no accessibility violations', async () => {
    const w = mk(settings({ 'notify.quietStart': 60, 'notify.quietEnd': 120 }), accounts, true)
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})

describe('RunHistory', () => {
  const run = (id: string, o: object = {}) => ({
    id,
    trigger: 'periodic',
    startedAt: '2026-10-28T10:00:00Z',
    endedAt: '2026-10-28T10:00:05Z',
    outcome: 'ok',
    newMessages: 3,
    triaged: 2,
    errorCode: null,
    ...o,
  })
  const mkRuns = (runs: object[], acc: object[]) =>
    mount(RunHistory, {
      props: { runs, accounts: acc } as never,
      global: { mocks },
      attachTo: document.body,
    })

  it('lists recent runs with counts, outcome and any error code', () => {
    const w = mkRuns([run('r1'), run('r2', { outcome: 'partial', errorCode: 'cap_reached' })], [])
    expect(w.get('[data-testid=run-r1]').text()).toContain('3 new, 2 sorted')
    expect(w.get('[data-testid=run-r1]').text()).toContain('Done')
    expect(w.get('[data-testid=run-r1]').find('[data-testid=error]').exists()).toBe(false)
    expect(w.get('[data-testid=run-r2]').get('[data-testid=error]').text()).toBe(
      'Problem: cap_reached',
    )
    expect(w.get('[data-testid=run-r2]').text()).toContain('Partly done')
    w.unmount()
  })

  it('shows empty states and per-account sync state, flagging accounts that need attention', () => {
    const empty = mkRuns([], [])
    expect(empty.text()).toContain('No checks have run yet.')
    expect(empty.text()).toContain('No accounts connected.')
    empty.unmount()
    const w = mkRuns(
      [],
      [
        { id: 'a1', email: 'one@x.test', status: 'active', lastSyncAt: '2026-10-28T09:00:00Z' },
        { id: 'a2', email: 'two@x.test', status: 'needs_reauth', lastSyncAt: null },
      ],
    )
    expect(w.get('[data-testid=acct-a1]').text()).toContain('Last checked')
    expect(w.get('[data-testid=acct-a1]').text()).not.toContain('Needs attention')
    expect(w.get('[data-testid=acct-a2]').text()).toContain('Needs attention')
    expect(w.get('[data-testid=acct-a2]').text()).toContain('Not checked yet')
    w.unmount()
  })
})

describe('time of day helpers', () => {
  it('round-trips and rejects bad input', () => {
    expect(minutesToTime(450)).toBe('07:30')
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(2000)).toBe('23:59')
    expect(timeToMinutes('07:30')).toBe(450)
    expect(timeToMinutes('7:05')).toBe(425)
    for (const bad of ['', '24:00', '12:60', 'ab:cd', '1230']) expect(timeToMinutes(bad)).toBeNull()
  })
})
