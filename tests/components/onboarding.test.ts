// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import OnboardingFlow from '../../app/components/onboarding/OnboardingFlow.vue'
import CredentialsForm from '../../app/components/auth/CredentialsForm.vue'
import CodeForm from '../../app/components/auth/CodeForm.vue'
import { asStep, nextStep, prevStep, STEPS } from '../../app/utils/onboarding'
import { guardRedirect, safeNext } from '../../app/utils/route-guard'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const FailureBanner = { props: ['failure'], template: '<p role="alert">{{ failure.kind }}</p>' }
const global = { mocks: { $t: t }, stubs: { NuxtLink, FailureBanner } }

const flow = (o: object = {}, attach = false) =>
  mount(OnboardingFlow, {
    props: {
      step: 'welcome',
      accountCount: 0,
      aiReady: false,
      briefMinutes: 450,
      briefNotify: false,
      ...o,
    } as never,
    global,
    attachTo: attach ? document.body : undefined,
    slots: { push: '<span data-testid="push-slot">push</span>' },
  })

describe('route guard', () => {
  const fresh = { id: 'u', email: 'a@x.test', onboarded: false }
  const done = { ...fresh, onboarded: true }

  it('signed-out visitors may open only the public pages', () => {
    for (const p of ['/login', '/signup', '/reset', '/reset/confirm'])
      expect(guardRedirect(p, null)).toBeNull()
    expect(guardRedirect('/', null)).toBe('/login')
    expect(guardRedirect('/inbox/1', null)).toBe('/login?next=%2Finbox%2F1')
    expect(guardRedirect('/onboarding', null)).toBe('/login?next=%2Fonboarding')
    expect(guardRedirect('/loginx', null)).toBe('/login?next=%2Floginx')
  })

  it('new users are sent to onboarding, except for onboarding and settings themselves', () => {
    expect(guardRedirect('/', fresh)).toBe('/onboarding')
    expect(guardRedirect('/inbox', fresh)).toBe('/onboarding')
    expect(guardRedirect('/onboarding', fresh)).toBeNull()
    expect(guardRedirect('/settings/accounts', fresh)).toBeNull()
    expect(guardRedirect('/settings/ai/consent', fresh)).toBeNull()
  })

  it('finished users go straight in and are moved off the login pages', () => {
    expect(guardRedirect('/', done)).toBeNull()
    expect(guardRedirect('/inbox', done)).toBeNull()
    expect(guardRedirect('/login', done)).toBe('/')
    expect(guardRedirect('/signup', fresh)).toBe('/onboarding')
  })

  it('next is always an in-app path', () => {
    expect(safeNext('/inbox/1')).toBe('/inbox/1')
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', 'javascript:1', undefined, 5])
      expect(safeNext(bad)).toBe('/')
  })
})

describe('onboarding steps', () => {
  it('walks forward and back and resumes from any stored value', () => {
    expect(nextStep('welcome')).toBe('privacy')
    expect(nextStep('brief')).toBeNull()
    expect(prevStep('welcome')).toBeNull()
    expect(prevStep('ai')).toBe('accounts')
    expect(asStep(3)).toBe('ai')
    expect(asStep(99)).toBe('welcome')
    expect(asStep('ai')).toBe('welcome')
    expect(asStep(undefined)).toBe('welcome')
    expect(STEPS).toHaveLength(5)
  })
})

describe('OnboardingFlow', () => {
  it('shows progress and moves forward and back', async () => {
    const w = flow({ step: 'privacy' })
    expect(w.get('[data-testid=progress]').text()).toBe('Step 2 of 5')
    expect(w.text()).toContain('never sends an email without showing you')
    await w.get('[data-testid=next]').trigger('click')
    expect(w.emitted('go')!.at(-1)).toEqual(['accounts'])
    await w.get('[data-testid=back]').trigger('click')
    expect(w.emitted('go')!.at(-1)).toEqual(['welcome'])
  })

  it('has no Back on the first step; the last step finishes', async () => {
    expect(flow().find('[data-testid=back]').exists()).toBe(false)
    const w = flow({ step: 'brief' })
    expect(w.get('[data-testid=next]').text()).toBe('Finish')
    await w.get('[data-testid=next]').trigger('click')
    expect(w.emitted('finish')).toHaveLength(1)
    expect(w.get('[data-testid=push-slot]').exists()).toBe(true)
  })

  it('every step can be skipped', async () => {
    for (const step of STEPS) {
      const w = flow({ step })
      await w.get('[data-testid=skip]').trigger('click')
      expect(w.emitted('skip')).toHaveLength(1)
    }
  })

  it('shows the connected-account and AI state with links to set them up', () => {
    const none = flow({ step: 'accounts' })
    expect(none.get('[data-testid=accounts-state]').text()).toBe('No account connected yet.')
    expect(none.find('a[href="/settings/accounts"]').exists()).toBe(true)
    expect(
      flow({ step: 'accounts', accountCount: 2 }).get('[data-testid=accounts-state]').text(),
    ).toBe('Connected: 2')
    const ai = flow({ step: 'ai', aiReady: true })
    expect(ai.get('[data-testid=ai-state]').text()).toBe('An AI provider is set up.')
    expect(ai.find('a[href="/settings/ai/consent"]').exists()).toBe(true)
  })

  it('brief step: time and notification choices are emitted', async () => {
    const w = flow({ step: 'brief' })
    expect((w.get('[data-testid=brief-time]').element as HTMLInputElement).value).toBe('07:30')
    await w.get('[data-testid=brief-time]').setValue('08:00')
    expect(w.emitted('brief')!.at(-1)).toEqual([{ 'brief.minutes': 480 }])
    await w.get('[data-testid=brief-notify]').setValue(true)
    expect(w.emitted('brief')!.at(-1)).toEqual([{ 'brief.notify': true }])
  })

  it.each(STEPS)('step %s has no accessibility violations', async (step) => {
    const w = flow({ step }, true)
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})

describe('auth forms', () => {
  it('login submits trimmed email, clears the password field, and waits while busy', async () => {
    const w = mount(CredentialsForm, { props: { mode: 'login' }, global, attachTo: document.body })
    await w.get('#auth-email').setValue('  me@x.test ')
    await w.get('#auth-password').setValue('correct horse battery')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')![0]).toEqual([
      { email: 'me@x.test', password: 'correct horse battery' },
    ])
    expect((w.get('#auth-password').element as HTMLInputElement).value).toBe('')
    expect(w.get('button[type=submit]').attributes('disabled')).toBeDefined() // empty password again
    expect(w.text()).toContain('Sign in')
    w.unmount()
  })

  it('signup shows the password hint and the right wording; failures are announced', () => {
    const w = mount(CredentialsForm, {
      props: { mode: 'signup', failure: { kind: 'validation' } },
      global,
    })
    expect(w.text()).toContain('at least 12 characters')
    expect(w.text()).toContain('Create account')
    expect(w.get('[role=alert]').exists()).toBe(true)
    expect(w.get('#auth-password').attributes('autocomplete')).toBe('new-password')
  })

  it('the second-factor form submits a trimmed code and clears it', async () => {
    const w = mount(CodeForm, { global, attachTo: document.body })
    await w.get('#auth-code').setValue(' 123456 ')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')![0]).toEqual(['123456'])
    expect((w.get('#auth-code').element as HTMLInputElement).value).toBe('')
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
