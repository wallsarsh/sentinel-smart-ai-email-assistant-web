// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import AuditLog from '../../app/components/security/AuditLog.vue'
import MfaPanel from '../../app/components/security/MfaPanel.vue'
import PasswordForm from '../../app/components/security/PasswordForm.vue'
import SessionList from '../../app/components/security/SessionList.vue'
import StepUpPrompt from '../../app/components/security/StepUpPrompt.vue'
import { failureOf, needsStepUp } from '../../app/utils/step-up'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const $te = (key: string) =>
  typeof key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) ===
  'string'
const FailureBanner = { props: ['failure'], template: '<p role="alert">{{ failure.kind }}</p>' }
const SecurityStepUpPrompt = StepUpPrompt
const global = { mocks: { $t: t, $te }, stubs: { FailureBanner, SecurityStepUpPrompt } }
afterEach(() => vi.unstubAllGlobals())

type Call = { u: string; body?: unknown }
function fetchStub(handler: (u: string, o: { body?: unknown }) => unknown) {
  const calls: Call[] = []
  vi.stubGlobal('$fetch', async (u: string, o: { body?: unknown } = {}) => {
    calls.push({ u, body: o.body })
    return handler(u, o)
  })
  return calls
}

describe('step-up helpers', () => {
  it('recognises the step-up refusal and extracts failures', () => {
    expect(needsStepUp({ statusCode: 403, statusMessage: 'step_up_required' })).toBe(true)
    expect(needsStepUp({ statusCode: 403, statusMessage: 'csrf' })).toBe(false)
    expect(needsStepUp(new Error('x'))).toBe(false)
    expect(failureOf({ data: { error: { kind: 'auth' } } })).toEqual({ kind: 'auth' })
    expect(failureOf(new Error('x'))).toEqual({ kind: 'network' })
  })
})

describe('PasswordForm', () => {
  const fill = async (
    w: ReturnType<typeof mount>,
    cur = 'old password here',
    next = 'new password phrase',
  ) => {
    await w.get('[data-testid=pw-current]').setValue(cur)
    await w.get('[data-testid=pw-next]').setValue(next)
  }

  it('sends both passwords, then clears them and confirms', async () => {
    const calls = fetchStub(() => ({ ok: true }))
    const w = mount(PasswordForm, { global })
    await fill(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual([
      {
        u: '/api/auth/password',
        body: { current: 'old password here', next: 'new password phrase' },
      },
    ])
    expect(w.get('[data-testid=password-done]').text()).toContain('Password changed')
    expect((w.get('[data-testid=pw-current]').element as HTMLInputElement).value).toBe('')
    expect((w.get('[data-testid=pw-next]').element as HTMLInputElement).value).toBe('')
  })

  it('shows the failure and clears the current password after a refusal', async () => {
    fetchStub(() => {
      throw { statusCode: 401, data: { error: { kind: 'auth' } } }
    })
    const w = mount(PasswordForm, { global })
    await fill(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toBe('auth')
    expect((w.get('[data-testid=pw-current]').element as HTMLInputElement).value).toBe('')
    expect(w.find('[data-testid=password-done]').exists()).toBe(false)
  })

  it('asks for a second-factor code when the server wants one, then retries', async () => {
    let verified = false
    const calls = fetchStub((u) => {
      if (u === '/api/auth/mfa/step-up') return void (verified = true)
      if (!verified) throw { statusCode: 403, statusMessage: 'step_up_required' }
      return { ok: true }
    })
    const w = mount(PasswordForm, { global })
    await fill(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    await w.get('[data-testid=stepup-code]').setValue('123456')
    await w
      .get('[data-testid=stepup-code]')
      .element.closest('form')!
      .dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(calls.map((c) => c.u)).toEqual([
      '/api/auth/password',
      '/api/auth/mfa/step-up',
      '/api/auth/password',
    ])
    expect(w.find('[data-testid=password-done]').exists()).toBe(true)
  })
})

describe('MfaPanel', () => {
  it('walks through enabling: key shown, code confirms, recovery codes shown once', async () => {
    let enabled = false
    const calls = fetchStub((u) => {
      if (u === '/api/auth/mfa/status') return { enabled, recoveryCodesLeft: enabled ? 10 : 0 }
      if (u === '/api/auth/mfa/begin')
        return { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }
      if (u === '/api/auth/mfa/confirm') {
        enabled = true
        return { recoveryCodes: ['AAAA-1111', 'BBBB-2222'] }
      }
    })
    const w = mount(MfaPanel, { global, attachTo: document.body })
    await flushPromises()
    expect(w.text()).toContain('Add a second step')
    await w.get('[data-testid=mfa-begin]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid=mfa-secret]').text()).toBe('JBSWY3DPEHPK3PXP')
    await w.get('[data-testid=mfa-code]').setValue('123456')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.u === '/api/auth/mfa/confirm')!.body).toEqual({ code: '123456' })
    expect(w.get('[data-testid=recovery-codes]').text()).toContain('AAAA-1111')
    expect(w.text()).toContain('Recovery codes left: 10')
    await w.get('[data-testid=codes-saved]').trigger('click')
    expect(w.find('[data-testid=recovery-codes]').exists()).toBe(false)
    w.unmount()
  })

  it('when on: renewing and turning off need a code; a wrong code shows the failure', async () => {
    let bad = true
    const calls = fetchStub((u) => {
      if (u === '/api/auth/mfa/status') return { enabled: true, recoveryCodesLeft: 4 }
      if (bad) throw { data: { error: { kind: 'auth' } } }
      if (u === '/api/auth/mfa/recovery') return { recoveryCodes: ['CCCC-3333'] }
    })
    const w = mount(MfaPanel, { global })
    await flushPromises()
    expect(w.get('[data-testid=mfa-renew]').attributes('disabled')).toBeDefined() // no code yet
    await w.get('[data-testid=mfa-code]').setValue('000000')
    await w.get('[data-testid=mfa-renew]').trigger('click')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toBe('auth')
    bad = false
    await w.get('[data-testid=mfa-code]').setValue('123456')
    await w.get('[data-testid=mfa-renew]').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.u === '/api/auth/mfa/recovery')).toHaveLength(2)
    expect(w.get('[data-testid=recovery-codes]').text()).toContain('CCCC-3333')
  })
})

describe('SessionList and AuditLog', () => {
  const rows = [
    {
      handle: 'aaaaaaaaaaaaaaaa',
      userAgent: 'Firefox',
      createdAt: '2026-10-27T10:00:00Z',
      lastSeenAt: '2026-10-28T09:00:00Z',
      current: true,
    },
    {
      handle: 'bbbbbbbbbbbbbbbb',
      userAgent: '',
      createdAt: '2026-10-20T10:00:00Z',
      lastSeenAt: '2026-10-21T09:00:00Z',
      current: false,
    },
  ]
  it('marks this browser, offers revoke for each and sign-out-everywhere-else', async () => {
    const w = mount(SessionList, { props: { sessions: rows }, global, attachTo: document.body })
    expect(w.get('[data-testid=session-aaaaaaaaaaaaaaaa] [data-testid=current]').exists()).toBe(
      true,
    )
    expect(w.get('[data-testid=session-bbbbbbbbbbbbbbbb]').text()).toContain('Unknown browser')
    await w.get('[data-testid=revoke-bbbbbbbbbbbbbbbb]').trigger('click')
    expect(w.emitted('revoke')![0]).toEqual(['bbbbbbbbbbbbbbbb'])
    await w.get('[data-testid=revoke-others]').trigger('click')
    expect(w.emitted('revokeOthers')).toHaveLength(1)
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })

  it('does not offer "everywhere else" when there is only one session', () => {
    const w = mount(SessionList, { props: { sessions: [rows[0]!] }, global })
    expect(w.find('[data-testid=revoke-others]').exists()).toBe(false)
  })

  it('audit log shows readable event names, falling back to the raw code', () => {
    const w = mount(AuditLog, {
      props: {
        rows: [
          { at: '2026-10-28T09:00:00Z', event: 'login_failed', detail: 'n=2', ip: '203.0.113.5' },
          { at: '2026-10-28T08:00:00Z', event: 'something_new', detail: '', ip: '' },
        ],
      },
      global,
    })
    const text = w.findAll('[data-testid=audit-row]').map((r) => r.text())
    expect(text[0]).toContain('Failed sign-in')
    expect(text[0]).toContain('203.0.113.5')
    expect(text[0]).not.toContain('n=2')
    expect(text[1]).toContain('something_new')
    expect(mount(AuditLog, { props: { rows: [] }, global }).text()).toContain(
      'Nothing recorded yet.',
    )
  })
})
