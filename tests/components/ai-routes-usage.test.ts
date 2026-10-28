// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import RouteEditor from '../../app/components/ai/RouteEditor.vue'
import { byDay, byModel, usd, type UsageRow } from '../../app/utils/usage'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
afterEach(() => vi.unstubAllGlobals())
const providers = [
  {
    id: 'p1',
    kind: 'openai',
    displayName: 'One',
    baseUrl: 'https://x.test',
    status: 'ok',
    consentGivenAt: null,
    models: ['m1', 'm2'],
    keyHint: '…1',
  },
  {
    id: 'p2',
    kind: 'anthropic',
    displayName: 'Two',
    baseUrl: 'https://y.test',
    status: 'ok',
    consentGivenAt: null,
    models: ['n1'],
    keyHint: '…2',
  },
]

describe('usage helpers', () => {
  const rows: UsageRow[] = [
    {
      day: '2026-10-27',
      providerId: 'p1',
      model: 'm1',
      task: 'triage',
      calls: 3,
      inputTokens: 100,
      outputTokens: 50,
      costMicros: 450,
    },
    {
      day: '2026-10-28',
      providerId: 'p1',
      model: 'm1',
      task: 'draft',
      calls: 1,
      inputTokens: 10,
      outputTokens: 5,
      costMicros: 45,
    },
    {
      day: '2026-10-28',
      providerId: 'p2',
      model: 'n1',
      task: 'brief',
      calls: 1,
      inputTokens: 1000,
      outputTokens: 0,
      costMicros: 0,
    },
  ]
  it('fills every day in the window with zeros and sums per day', () => {
    const d = byDay(rows, 3, new Date('2026-10-28T12:00:00Z'))
    expect(d.map((x) => x.day)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28'])
    expect(d.map((x) => x.tokens)).toEqual([0, 150, 1015])
    expect(d[2]).toMatchObject({ calls: 2, costMicros: 45 })
  })
  it('totals per model and flags models without a price', () => {
    const m = byModel(rows, { m1: { in: 3, out: 15 } })
    expect(m).toEqual([
      { model: 'n1', tokens: 1000, costMicros: 0, calls: 1, unpriced: true },
      { model: 'm1', tokens: 165, costMicros: 495, calls: 4, unpriced: false },
    ])
  })
  it('formats micro-dollars', () => {
    expect([usd(0), usd(495), usd(12_345_678)]).toEqual(['$0.0000', '$0.0005', '$12.35'])
  })
})

describe('RouteEditor', () => {
  const mk = (modelValue: object[] = []) =>
    mount(RouteEditor, {
      props: { task: 'triage', providers, modelValue } as never,
      attachTo: document.body,
      global: { mocks: { $t: t } },
    })

  it('adds, reorders and removes fallbacks, then saves the whole chain', async () => {
    const calls: { body: { task: string; chain: unknown[] } }[] = []
    vi.stubGlobal('$fetch', async (_u: string, o: { body: { task: string; chain: unknown[] } }) => {
      calls.push(o)
      return {}
    })
    const w = mk([{ providerId: 'p1', model: 'm1', params: { maxTokens: 800 } }])
    const buttons = (label: string) => w.findAll('button').filter((b) => b.text() === label)
    await buttons('Add fallback')[0]!.trigger('click')
    await w.find('#triage-p1').setValue('p2')
    await w.find('#triage-m1').setValue('n1')
    await buttons('Move up')[1]!.trigger('click')
    await buttons('Save')[0]!.trigger('click')
    await flushPromises()
    expect(calls[0]!.body).toEqual({
      task: 'triage',
      chain: [
        { providerId: 'p2', model: 'n1', params: {} },
        { providerId: 'p1', model: 'm1', params: { maxTokens: 800 } },
      ],
    })
    await buttons('Remove')[0]!.trigger('click')
    expect(w.findAll('li')).toHaveLength(1)
    w.unmount()
  })

  it('limits the chain to four routes and offers the provider models', async () => {
    const w = mk()
    for (let i = 0; i < 6; i++)
      await w
        .findAll('button')
        .find((b) => b.text() === 'Add fallback')!
        .trigger('click')
    expect(w.findAll('li')).toHaveLength(4)
    expect(
      w
        .find('datalist')
        .findAll('option')
        .map((o) => o.attributes('value')),
    ).toEqual(['m1', 'm2'])
    w.unmount()
  })

  it('is accessible (axe)', async () => {
    const w = mk([{ providerId: 'p1', model: 'm1', params: {} }])
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
