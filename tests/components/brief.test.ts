// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import BriefBody from '../../app/components/brief/BriefBody.vue'
import BriefSkeleton from '../../app/components/brief/BriefSkeleton.vue'
import { briefActionTarget } from '../../app/utils/brief-action'
import {
  fromLocalInput,
  isStale,
  presetStart,
  toLocalInput,
  validRange,
} from '../../app/utils/catch-up'
import en from '../../i18n/locales/en.json'
import type { DailyBrief } from '../../shared/brief'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const NOW = new Date('2026-10-28T08:00:00Z')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const brief = (o: Partial<DailyBrief> = {}): DailyBrief => ({
  id: A,
  windowStart: '2026-10-27T08:00:00Z',
  windowEnd: '2026-10-28T08:00:00Z',
  headline: 'Two things need you today.',
  sections: [
    { type: 'topPriorities', items: [{ text: 'Reply to Alex', messageIds: [A] }] },
    { type: 'fyi', items: [{ text: 'Invoices arrived', messageIds: [A, B] }] },
  ],
  stats: { total: 12, needsReply: 3, p1: 1, p2: 0, newsletters: 0, notifications: 4 },
  createdAt: '2026-10-28T07:00:00Z',
  model: 'm',
  ...o,
})
const mk = (props: object) =>
  mount(BriefBody, {
    props: props as never,
    global: { mocks: { $t: t }, stubs: { NuxtLink } },
  })
afterEach(() => vi.unstubAllGlobals())

describe('BriefBody', () => {
  it('shows headline, DB counts (zero counts hidden) and sections with links', () => {
    const w = mk({ brief: brief() })
    expect(w.get('[data-testid=headline]').text()).toBe('Two things need you today.')
    expect(w.get('[data-testid=stats]').text()).toContain('12 emails')
    expect(w.get('[data-testid=stats]').text()).toContain('4 notifications')
    expect(w.get('[data-testid=stats]').text()).not.toContain('newsletters')
    expect(w.text()).toContain('Top priorities')
    expect(w.find('a[href="/inbox/' + A + '"]').text()).toBe('Reply to Alex')
  })

  it('an empty headline reads "nothing new"', () => {
    const w = mk({ brief: brief({ headline: '', sections: [] }) })
    expect(w.get('[data-testid=headline]').text()).toBe('Nothing new to report.')
  })

  it('an item with several mails opens a list of them', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('$fetch', async (_u: string, o: unknown) => {
      calls.push(o)
      return {
        heads: [
          { id: A, subject: 'Invoice 1', sender: 'Billing', address: 'b@x.test' },
          { id: B, subject: '', sender: null, address: 'c@x.test' },
        ],
      }
    })
    const w = mk({ brief: brief() })
    await w
      .findAll('button')
      .find((b) => b.text() === 'Invoices arrived')!
      .trigger('click')
    await flushPromises()
    expect(calls).toEqual([{ query: { ids: `${A},${B}` } }])
    const list = w.get('[data-testid=heads]')
    expect(list.find(`a[href="/inbox/${A}"]`).text()).toBe('Invoice 1')
    expect(list.find(`a[href="/inbox/${B}"]`).text()).toBe('c@x.test')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Invoices arrived')!
      .trigger('click')
    expect(w.find('[data-testid=heads]').exists()).toBe(false)
  })

  it('a failed lookup says so instead of showing nothing', async () => {
    vi.stubGlobal('$fetch', async () => {
      throw new Error('x')
    })
    const w = mk({ brief: brief() })
    await w.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(w.get('[data-testid=heads]').get('[role=alert]').exists()).toBe(true)
  })

  it('shows a stale banner only when asked and the brief is over a day old', () => {
    const old = brief({ createdAt: '2026-10-26T07:00:00Z' })
    expect(mk({ brief: old, showStale: true, now: NOW }).find('[data-testid=stale]').exists()).toBe(
      true,
    )
    expect(mk({ brief: old, now: NOW }).find('[data-testid=stale]').exists()).toBe(false)
    expect(
      mk({ brief: brief(), showStale: true, now: NOW }).find('[data-testid=stale]').exists(),
    ).toBe(false)
  })

  it('has no accessibility violations (body and skeleton)', async () => {
    const w = mount(BriefBody, {
      props: { brief: brief() } as never,
      global: { mocks: { $t: t }, stubs: { NuxtLink } },
      attachTo: document.body,
    })
    const s = mount(BriefSkeleton, { global: { mocks: { $t: t } }, attachTo: document.body })
    for (const el of [w.element, s.element]) {
      const r = await axe.run(el as HTMLElement, {
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      })
      expect(r.violations.map((v) => v.id)).toEqual([])
    }
    expect(s.text()).toContain('Writing your brief')
    w.unmount()
    s.unmount()
  })
})

describe('catch-up helpers', () => {
  const now = new Date(2026, 9, 28, 15, 30)
  it('preset starts', () => {
    expect(presetStart('threeHours', now)).toEqual(new Date(2026, 9, 28, 12, 30))
    expect(presetStart('today', now)).toEqual(new Date(2026, 9, 28, 0, 0))
    expect(now.getTime() - presetStart('threeDays', now).getTime()).toBe(72 * 3_600_000)
    expect(now.getTime() - presetStart('week', now).getTime()).toBe(168 * 3_600_000)
  })
  it('validates ranges: ordered, not in the future, within 90 days', () => {
    const h = 3_600_000
    expect(validRange(new Date(now.getTime() - h), now, now)).toBe(true)
    expect(validRange(now, new Date(now.getTime() - h), now)).toBe(false)
    expect(validRange(new Date(now.getTime() - h), new Date(now.getTime() + 2 * h), now)).toBe(
      false,
    )
    expect(validRange(new Date(now.getTime() - 91 * 24 * h), now, now)).toBe(false)
    expect(validRange(new Date('nope'), now, now)).toBe(false)
  })
  it('round-trips the datetime-local value', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05T07:04')
    expect(fromLocalInput('2026-01-05T07:04')).toEqual(new Date(2026, 0, 5, 7, 4))
  })
  it('stale after 24 hours', () => {
    expect(isStale('2026-10-27T08:00:01Z', NOW)).toBe(false)
    expect(isStale('2026-10-27T07:59:59Z', NOW)).toBe(true)
  })
  it('recovery buttons lead to settings; retry stays on the page', () => {
    expect(briefActionTarget('open_ai_settings')).toBe('/settings/ai')
    expect(briefActionTarget('reconnect')).toBe('/settings/accounts')
    expect(briefActionTarget('retry')).toBeNull()
  })
})
