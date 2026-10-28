// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import ProviderCard from '../../app/components/ai/ProviderCard.vue'
import ProviderForm from '../../app/components/ai/ProviderForm.vue'
import FailureBanner from '../../app/components/FailureBanner.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const global = {
  mocks: { $t: t },
  components: { FailureBanner },
  stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
}
afterEach(() => vi.unstubAllGlobals())

const presets = [
  {
    id: 'claude',
    kind: 'anthropic',
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    editableUrl: false,
  },
  {
    id: 'compatible',
    kind: 'openai_compatible',
    name: 'OpenAI-compatible',
    baseUrl: '',
    editableUrl: true,
  },
]
const provider = {
  id: 'p1',
  kind: 'openai',
  displayName: 'ChatGPT',
  baseUrl: 'https://api.openai.com/v1',
  status: 'ok',
  consentGivenAt: null,
  models: ['a', 'b'],
  keyHint: '…1234',
}

describe('ProviderForm', () => {
  it('the key field is a write-only password input, cleared after submit; base URL only for compatible', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('$fetch', async (url: string, o: { body: Record<string, unknown> }) => {
      calls.push({ url, body: o.body })
      return {}
    })
    const w = mount(ProviderForm, { props: { presets }, global })
    expect(w.find('#prov-key').attributes('type')).toBe('password')
    expect(w.find('#prov-url').exists()).toBe(false)
    await w.find('#prov-preset').setValue('compatible')
    expect(w.find('#prov-url').exists()).toBe(true)
    await w.find('#prov-url').setValue('https://llm.example.com/v1')
    await w.find('#prov-key').setValue('sk-secret-12345678')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]!.body).toMatchObject({
      presetId: 'compatible',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'sk-secret-12345678',
    })
    expect((w.find('#prov-key').element as HTMLInputElement).value).toBe('')
    expect(w.emitted('added')).toBeTruthy()
    expect(w.html()).not.toContain('sk-secret')
  })

  it('shows a localized failure, e.g. for a blocked base URL', async () => {
    vi.stubGlobal('$fetch', async () => {
      throw {
        data: {
          error: { kind: 'validation', detail: { field: 'baseUrl', code: 'private_address' } },
        },
      }
    })
    const w = mount(ProviderForm, { props: { presets }, global })
    await w.find('#prov-key').setValue('sk-secret-12345678')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('not allowed')
    expect(w.emitted('added')).toBeFalsy()
  })
})

describe('ProviderCard', () => {
  it('shows only the key hint, tests the connection and replaces the key via a write-only field', async () => {
    const calls: string[] = []
    vi.stubGlobal('$fetch', async (url: string, o?: { method?: string; body?: unknown }) => {
      calls.push(`${o?.method} ${url}`)
      return { models: ['a'] }
    })
    const w = mount(ProviderCard, { props: { provider }, global })
    expect(w.text()).toContain('Key …1234')
    expect(w.text()).toContain('2 models')
    expect(w.text()).toContain('Review and allow')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Test connection')!
      .trigger('click')
    await flushPromises()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Replace key')!
      .trigger('click')
    const input = w.find('input[type=password]')
    expect(input.exists()).toBe(true)
    await input.setValue('sk-new-0000000000')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual(['POST /api/ai/providers/p1/test', 'PUT /api/ai/providers/p1/key'])
    expect(w.emitted('changed')).toHaveLength(2)
  })

  it('bad-key status and consent state are visible; axe passes', async () => {
    const w = mount(ProviderCard, {
      props: {
        provider: { ...provider, status: 'bad_key', consentGivenAt: '2026-10-28T10:00:00Z' },
      },
      attachTo: document.body,
      global,
    })
    expect(w.text()).toContain('Key rejected')
    expect(w.text()).toContain('Manage consent')
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
