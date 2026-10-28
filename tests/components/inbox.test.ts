// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import SegmentChips from '../../app/components/inbox/SegmentChips.vue'
import MessageRow from '../../app/components/inbox/MessageRow.vue'
import VirtualMessageList from '../../app/components/inbox/VirtualMessageList.vue'
import { visibleRange } from '../../app/utils/virtual-list'
import en from '../../i18n/locales/en.json'

const t = (key: string) =>
  (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
  key
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const mocks = { $t: t }
const row = (i: number, over = {}) => ({
  id: `id${i}`,
  fromAddress: `a${i}@x.test`,
  fromName: `Sender ${i}`,
  subject: `Subject ${i}`,
  snippet: 'snippet',
  receivedAt: '2026-10-27T09:00:00Z',
  isRead: i % 2 === 0,
  priority: null,
  needsReply: null,
  summary: null,
  ...over,
})

describe('visibleRange', () => {
  it('windows a long list with overscan and padding', () => {
    expect(visibleRange({ scrollTop: 0, viewport: 500, rowHeight: 50, total: 5000 })).toEqual({
      start: 0,
      end: 15,
      padTop: 0,
      padBottom: 249_250,
    })
    const mid = visibleRange({ scrollTop: 50_000, viewport: 500, rowHeight: 50, total: 5000 })
    expect(mid.start).toBe(995)
    expect(mid.end - mid.start).toBeLessThan(25)
    expect(visibleRange({ scrollTop: 0, viewport: 500, rowHeight: 50, total: 3 })).toMatchObject({
      start: 0,
      end: 3,
      padBottom: 0,
    })
  })
})

describe('inbox components', () => {
  it('chips show counts and emit the chosen segment', async () => {
    const w = mount(SegmentChips, {
      props: { modelValue: 'all', counts: { all: 12, needs_reply: 3 } },
      global: { mocks },
    })
    expect(w.text()).toContain('Needs reply 3')
    expect(w.find('[aria-selected="true"]').text()).toContain('All')
    await w.find('#seg-needs_reply').trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual(['needs_reply'])
  })

  it('row marks unread for assistive tech and bolds it', () => {
    const w = mount(MessageRow, { props: { row: row(1) }, global: { mocks, stubs: { NuxtLink } } })
    expect(w.text()).toContain('Unread')
    expect(w.find('.font-bold').exists()).toBe(true)
    const read = mount(MessageRow, {
      props: { row: row(2) },
      global: { mocks, stubs: { NuxtLink } },
    })
    expect(read.text()).not.toContain('Unread')
  })

  it('renders only a window of 5,000 rows and asks for more near the end', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => row(i))
    const w = mount(VirtualMessageList, {
      props: { rows },
      global: { mocks, stubs: { NuxtLink }, components: { InboxMessageRow: MessageRow } },
    })
    expect(w.findAll('[role=listitem]').length).toBeLessThan(30)
    const el = w.find('[role=list]').element as HTMLElement
    Object.defineProperty(el, 'scrollHeight', { value: 380_000 })
    Object.defineProperty(el, 'clientHeight', { value: 560 })
    el.scrollTop = 379_000
    await w.find('[role=list]').trigger('scroll')
    expect(w.emitted('nearEnd')).toBeTruthy()
    expect(w.findAll('[role=listitem]').length).toBeLessThan(30)
  })

  it('has no accessibility violations (axe)', async () => {
    const w = mount(
      {
        template:
          '<div><SegmentChips model-value="all" :counts="{all:1}" /><VirtualMessageList :rows="rows" /></div>',
        components: { SegmentChips, VirtualMessageList },
        data: () => ({ rows: [row(1), row(2)] }),
      },
      {
        attachTo: document.body,
        global: { mocks, stubs: { NuxtLink }, components: { InboxMessageRow: MessageRow } },
      },
    )
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    w.unmount()
  })
})
