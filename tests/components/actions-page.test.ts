// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import ActionGroup from '../../app/components/actions/ActionGroup.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string) =>
  (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
  key
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
const item = (id: string, o = {}) => ({
  id,
  messageId: `m-${id}`,
  text: `Task ${id}`,
  dueAt: '2026-10-27T15:00:00Z',
  dueText: null,
  status: 'open',
  subject: 'Q3 numbers',
  fromName: 'Alex',
  fromAddress: 'a@b.test',
  ...o,
})
const mk = (kind: string, items: object[]) =>
  mount(ActionGroup, {
    props: { kind, items } as never,
    attachTo: document.body,
    global: { mocks: { $t: t }, stubs: { NuxtLink } },
  })

describe('ActionGroup', () => {
  it('renders nothing for an empty group', () => expect(mk('today', []).html()).toBe('<!--v-if-->'))

  it('open items link to the source mail and offer done and snooze', async () => {
    const w = mk('today', [item('1')])
    expect(w.find('h2').text()).toContain('Today and overdue')
    expect(w.find('a').attributes('href')).toBe('/inbox/m-1')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Mark done')!
      .trigger('click')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Snooze to tomorrow')!
      .trigger('click')
    expect(w.emitted('done')![0]![0]).toMatchObject({ id: '1' })
    expect(w.emitted('snooze')![0]![0]).toMatchObject({ id: '1' })
    w.unmount()
  })

  it('done and snoozed groups offer reopen instead, and done text is struck through', async () => {
    const d = mk('done', [item('2', { status: 'done' })])
    expect(d.findAll('button').map((b) => b.text())).toEqual(['Reopen'])
    expect(d.find('.line-through').exists()).toBe(true)
    await d.find('button').trigger('click')
    expect(d.emitted('reopen')).toBeTruthy()
    const s = mk('snoozed', [item('3', { status: 'snoozed' })])
    expect(s.findAll('button').map((b) => b.text())).toEqual(['Mark done', 'Reopen'])
    d.unmount()
    s.unmount()
  })

  it('shows a due phrase when there is no date, and is accessible (axe)', async () => {
    const w = mk('noDate', [item('4', { dueAt: null, dueText: 'when you can' })])
    expect(w.text()).toContain('when you can')
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})
