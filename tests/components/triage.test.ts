// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import AiCard from '../../app/components/triage/AiCard.vue'
import PriorityChip from '../../app/components/triage/PriorityChip.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const global = { mocks: { $t: t }, components: { TriagePriorityChip: PriorityChip } }
afterEach(() => vi.unstubAllGlobals())
const triage = {
  priority: 'p1_do_now',
  category: 'work_request',
  importance: 'high',
  needsReply: true,
  summary: 'Alex needs the Q3 numbers by 3pm.',
  reason: 'VIP, deadline today',
  confidence: 0.9,
  source: 'ai' as const,
}

describe('priority chip', () => {
  it.each([
    ['p1_do_now', 'P1 Do now'],
    ['p2_today', 'P2 Today'],
    ['p3_this_week', 'P3 This week'],
    ['p4_fyi', 'P4 FYI'],
    ['weird', 'P4 FYI'],
  ])('%s is written out as text: %s', (p, label) => {
    const w = mount(PriorityChip, { props: { priority: p }, global })
    expect(w.text()).toContain(label)
  })
})

describe('AiCard', () => {
  it('shows summary, priority as text, reason and the mistakes notice', () => {
    const w = mount(AiCard, { props: { messageId: 'm1', triage }, global })
    expect(w.text()).toContain('P1 Do now')
    expect(w.text()).toContain('Alex needs the Q3 numbers')
    expect(w.text()).toContain('Why: VIP, deadline today')
    expect(w.text()).toContain('AI can make mistakes')
    expect(w.text()).toContain('Needs reply')
  })

  it('rule-labelled mail says so instead of claiming AI judged it', () => {
    const w = mount(AiCard, {
      props: { messageId: 'm1', triage: { ...triage, source: 'rule', summary: '' } },
      global,
    })
    expect(w.text()).toContain('Sorted by a rule, not by AI.')
    expect(w.text()).not.toContain('AI can make mistakes')
  })

  it('correcting importance sends the choice and tells the parent to reload', async () => {
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal('$fetch', async (url: string, o: { body: unknown }) => {
      calls.push({ url, body: o.body })
      return {}
    })
    const w = mount(AiCard, { props: { messageId: 'm1', triage }, global })
    await w
      .findAll('button')
      .find((b) => b.text() === 'Correct this')!
      .trigger('click')
    await w.find('#corr-importance').setValue('low')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toEqual([
      { url: '/api/messages/m1/triage', body: { importance: 'low', needsReply: true } },
    ])
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('toggling needs-reply sends only that change; failures are shown', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('$fetch', async (_u: string, o: { body: unknown }) => {
      bodies.push(o.body)
      throw new Error('x')
    })
    const w = mount(AiCard, { props: { messageId: 'm1', triage }, global })
    await w
      .findAll('button')
      .find((b) => b.text() === 'Correct this')!
      .trigger('click')
    await w
      .findAll('button')
      .find((b) => b.text() === 'No reply needed')!
      .trigger('click')
    await flushPromises()
    expect(bodies).toEqual([{ needsReply: false }])
    expect(w.text()).toContain('could not be saved')
  })

  it('is accessible (axe)', async () => {
    const w = mount(AiCard, { props: { messageId: 'm1', triage }, attachTo: document.body, global })
    await w
      .findAll('button')
      .find((b) => b.text() === 'Correct this')!
      .trigger('click')
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
