// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppNav from '../../app/components/shell/AppNav.vue'
import en from '../../i18n/locales/en.json'

const items = [
  { to: '/', labelKey: 'brief', icon: '☀' },
  { to: '/inbox', labelKey: 'inbox', icon: '✉' },
  { to: '/settings', labelKey: 'settings', icon: '⚙' },
]

const t = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string

function render(current: string) {
  return mount(AppNav, {
    props: { items, current },
    global: {
      mocks: { $t: t },
      stubs: {
        NuxtLink: {
          props: ['to'],
          template: '<a :href="to" v-bind="$attrs"><slot /></a>',
        },
      },
    },
  })
}

describe('AppNav', () => {
  it('is a labelled navigation landmark with one link per area', () => {
    const w = render('/')
    expect(w.get('nav').attributes('aria-label')).toBe('Main navigation')
    expect(w.findAll('a')).toHaveLength(3)
    expect(w.text()).toContain('Inbox')
  })

  it('marks only the current page', () => {
    const w = render('/inbox/123')
    const current = w.findAll('a').filter((a) => a.attributes('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]!.text()).toContain('Inbox')
  })

  it('root is current only on the root path', () => {
    const w = render('/settings')
    const brief = w.findAll('a')[0]!
    expect(brief.attributes('aria-current')).toBeUndefined()
  })

  it('links are large enough to tap', () => {
    const w = render('/')
    for (const a of w.findAll('a')) expect(a.classes()).toContain('min-h-12')
  })
})
