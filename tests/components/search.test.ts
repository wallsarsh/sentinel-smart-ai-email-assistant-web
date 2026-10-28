// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import SearchResult from '../../app/components/inbox/SearchResult.vue'
import { parseHeadline, recentSearches } from '../../app/utils/search-ui'
import en from '../../i18n/locales/en.json'

const t = (key: string) =>
  (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
  key
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const hit = (headline: string) => ({
  id: '1',
  subject: 'Invoice',
  fromAddress: 'a@b.test',
  fromName: null,
  receivedAt: '2026-10-27T09:00:00Z',
  isRead: false,
  headline,
})

describe('search ui', () => {
  it('splits headlines into marked segments and decodes entities', () => {
    expect(parseHeadline('pay <mark>invoice</mark> &amp; more &lt;b&gt;')).toEqual([
      { text: 'pay ', mark: false },
      { text: 'invoice', mark: true },
      { text: ' & more <b>', mark: false },
    ])
    expect(parseHeadline('')).toEqual([])
  })

  it('renders matches in <mark> and never as html', () => {
    const w = mount(SearchResult, {
      props: { hit: hit('x <mark>y</mark> &lt;img src=x onerror=alert(1)&gt;') },
      global: { mocks: { $t: t }, stubs: { NuxtLink } },
    })
    expect(w.find('mark').text()).toBe('y')
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toContain('<img src=x onerror=alert(1)>')
  })

  it('remembers recent searches locally, newest first, de-duplicated and capped', () => {
    const mem = new Map<string, string>()
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    }
    const r = recentSearches(store, 3)
    for (const q of ['alpha', 'beta', 'gamma', 'ALPHA', 'x']) r.add(q)
    expect(r.list()).toEqual(['ALPHA', 'gamma', 'beta'])
    r.clear()
    expect(r.list()).toEqual([])
  })

  it('survives broken or missing storage', () => {
    expect(recentSearches(null).add('hello')).toEqual(['hello'])
    const bad = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(recentSearches(bad).list()).toEqual([])
    expect(() => recentSearches(bad).add('hello')).not.toThrow()
    expect(recentSearches({ getItem: () => '{"a":1}', setItem: () => undefined }).list()).toEqual(
      [],
    )
  })

  it('results are accessible (axe)', async () => {
    const w = mount(
      {
        template:
          '<ul aria-label="Search results"><li v-for="h in hits" :key="h.id"><SearchResult :hit="h" /></li></ul>',
        components: { SearchResult },
        data: () => ({ hits: [hit('a <mark>b</mark>')] }),
      },
      { attachTo: document.body, global: { mocks: { $t: t }, stubs: { NuxtLink } } },
    )
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
