// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OfflineBanner from '../../app/components/shell/OfflineBanner.vue'
import en from '../../i18n/locales/en.json'

const $t = (k: string) =>
  k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], en) as string

describe('OfflineBanner', () => {
  it('appears when the browser goes offline and disappears when it returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const w = mount(OfflineBanner, { global: { mocks: { $t } } })
    expect(w.find('[data-testid=offline-banner]').exists()).toBe(false)
    online.mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await w.vm.$nextTick()
    expect(w.get('[data-testid=offline-banner]').text()).toContain('You are offline')
    expect(w.get('[data-testid=offline-banner]').attributes('role')).toBe('status')
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await w.vm.$nextTick()
    expect(w.find('[data-testid=offline-banner]').exists()).toBe(false)
    w.unmount()
    online.mockRestore()
  })

  it('starts offline when the page loads offline', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const w = mount(OfflineBanner, { global: { mocks: { $t } } })
    await w.vm.$nextTick()
    expect(w.find('[data-testid=offline-banner]').exists()).toBe(true)
    w.unmount()
    online.mockRestore()
  })
})
