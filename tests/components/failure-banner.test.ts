// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FailureBanner from '../../app/components/FailureBanner.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))

describe('FailureBanner', () => {
  const mk = (failure: object) =>
    mount(FailureBanner, { props: { failure: failure as never }, global: { mocks: { $t: t } } })

  it('shows the message and emits the recovery action', async () => {
    const w = mk({ kind: 'auth', detail: { problem: 'needs_reauth' } })
    expect(w.text()).toContain('needs to be reconnected')
    await w.find('button').trigger('click')
    expect(w.emitted('action')![0]).toEqual(['reconnect'])
    expect(w.attributes('role')).toBe('alert')
  })

  it('interpolates the wait and shows no button for waiting', () => {
    const w = mk({ kind: 'rate_limited', detail: { retryAfterSeconds: 9 } })
    expect(w.text()).toContain('9 seconds')
    expect(w.find('button').exists()).toBe(false)
    expect(w.attributes('role')).toBe('status')
  })
})
