// @vitest-environment happy-dom
import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import DataActions from '../../app/components/privacy/DataActions.vue'
import PrivacyForm, { type PrivacySettings } from '../../app/components/privacy/PrivacyForm.vue'
import { SETTINGS_SECTIONS } from '../../app/utils/settings-sections'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const FailureBanner = { props: ['failure'], template: '<p role="alert">{{ failure.kind }}</p>' }
const global = { mocks: { $t: t }, stubs: { FailureBanner } }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const settings = (o: Partial<PrivacySettings> = {}): PrivacySettings => ({
  'privacy.subjectOnly': false,
  'privacy.maxChars': 6000,
  'privacy.redactCards': true,
  'privacy.redactIbans': true,
  'privacy.redactPhones': true,
  'privacy.redactEmails': true,
  'retention.days': 30,
  ...o,
})
const accounts = [
  { id: 'a1', email: 'one@x.test', aiExcluded: false },
  { id: 'a2', email: 'two@x.test', aiExcluded: true },
]
const form = (s = settings(), attach = false) =>
  mount(PrivacyForm, {
    props: { settings: s, accounts },
    global,
    attachTo: attach ? document.body : undefined,
  })
const last = (w: ReturnType<typeof form>, ev: 'save' | 'exclude' = 'save') =>
  w.emitted(ev)!.at(-1)![0]

describe('PrivacyForm', () => {
  it('shows current values', () => {
    const w = form(settings({ 'privacy.subjectOnly': true, 'retention.days': 7 }))
    expect((w.get('[data-testid=scope-subject]').element as HTMLInputElement).checked).toBe(true)
    expect(w.get('[data-testid=max-chars]').attributes('disabled')).toBeDefined()
    expect((w.get('[data-testid=retention]').element as HTMLSelectElement).value).toBe('7')
    expect((w.get('[data-testid=exclude-a2]').element as HTMLInputElement).checked).toBe(true)
  })

  it('emits only what changed', async () => {
    const w = form()
    await w.get('[data-testid=scope-subject]').setValue(true)
    expect(last(w)).toEqual({ 'privacy.subjectOnly': true })
    await w.get('[data-testid=redact-cards]').setValue(false)
    expect(last(w)).toEqual({ 'privacy.redactCards': false })
    await w.get('[data-testid=redact-ibans]').setValue(false)
    expect(last(w)).toEqual({ 'privacy.redactIbans': false })
    await w.get('[data-testid=redact-phones]').setValue(false)
    expect(last(w)).toEqual({ 'privacy.redactPhones': false })
    await w.get('[data-testid=redact-emails]').setValue(false)
    expect(last(w)).toEqual({ 'privacy.redactEmails': false })
    await w.get('[data-testid=retention]').setValue('90')
    expect(last(w)).toEqual({ 'retention.days': 90 })
  })

  it('keeps the character cap inside its limits', async () => {
    const w = form()
    await w.get('[data-testid=max-chars]').setValue('99999')
    expect(last(w)).toEqual({ 'privacy.maxChars': 20000 })
    await w.get('[data-testid=max-chars]').setValue('10')
    expect(last(w)).toEqual({ 'privacy.maxChars': 500 })
    await w.get('[data-testid=max-chars]').setValue('abc')
    expect(last(w)).toEqual({ 'privacy.maxChars': 6000 })
  })

  it('per-account AI exclusion', async () => {
    const w = form()
    await w.get('[data-testid=exclude-a1]').setValue(true)
    expect(last(w, 'exclude')).toEqual({ id: 'a1', excluded: true })
    await w.get('[data-testid=exclude-a2]').setValue(false)
    expect(last(w, 'exclude')).toEqual({ id: 'a2', excluded: false })
  })

  it('has no accessibility violations', async () => {
    const w = form(settings(), true)
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})

describe('DataActions', () => {
  const mk = (attach = false) =>
    mount(DataActions, {
      props: { mfaEnabled: false },
      global,
      attachTo: attach ? document.body : undefined,
    })

  it('clearing cached mail asks first, then calls the API', async () => {
    const calls: string[] = []
    vi.stubGlobal('$fetch', async (u: string) => void calls.push(u))
    const w = mk()
    await w.get('[data-testid=clear]').trigger('click')
    expect(calls).toEqual([])
    await w.get('[data-testid=clear-confirm]').trigger('click')
    await flushPromises()
    expect(calls).toEqual(['/api/account/clear-cache'])
    expect(w.get('[data-testid=message]').text()).toBe('Cached mail cleared.')
  })

  it('deleting needs the password, sends it once, clears it and tells the page', async () => {
    const calls: { u: string; body: unknown }[] = []
    vi.stubGlobal(
      '$fetch',
      async (u: string, o: { body?: unknown }) => void calls.push({ u, body: o.body }),
    )
    const w = mk()
    await w.get('[data-testid=delete]').trigger('click')
    expect(w.get('[data-testid=delete-confirm]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid=delete-password]').setValue('my long password')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual([{ u: '/api/account/delete', body: { password: 'my long password' } }])
    expect(w.emitted('deleted')).toHaveLength(1)
  })

  it('a wrong password shows the failure and does not report deletion', async () => {
    vi.stubGlobal('$fetch', async () => {
      throw { statusCode: 401, data: { error: { kind: 'auth' } } }
    })
    const w = mk()
    await w.get('[data-testid=delete]').trigger('click')
    await w.get('[data-testid=delete-password]').setValue('nope nope nope')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toBe('auth')
    expect(w.emitted('deleted')).toBeUndefined()
  })

  it('export without a recent second factor asks for a code, then retries the export', async () => {
    const calls: string[] = []
    let verified = false
    vi.stubGlobal('$fetch', async (u: string) => {
      calls.push(u)
      if (u === '/api/auth/mfa/step-up') return void (verified = true)
      if (!verified) throw { statusCode: 403, statusMessage: 'step_up_required' }
      return new Blob(['zip'])
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const w = mk(true)
    await w.get('[data-testid=export]').trigger('click')
    await flushPromises()
    await w.get('[data-testid=step-up-code]').setValue('123456')
    await w.get('[data-testid=step-up]').trigger('submit')
    await flushPromises()
    expect(calls).toEqual(['/api/account/export', '/api/auth/mfa/step-up', '/api/account/export'])
    expect(w.get('[data-testid=message]').text()).toBe('Export downloaded.')
    w.unmount()
  })
})

describe('settings hub', () => {
  it('every section links to a page that exists and has text', () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(
        existsSync(`app/pages${s.to}.vue`) || existsSync(`app/pages${s.to}/index.vue`),
        s.to,
      ).toBe(true)
      const section = (en.settings.sections as Record<string, { title: string; hint: string }>)[
        s.key
      ]
      expect(section?.title, s.key).toBeTruthy()
      expect(section?.hint, s.key).toBeTruthy()
    }
  })
})
