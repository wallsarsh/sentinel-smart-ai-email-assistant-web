// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LinkGuardDialog from '../../app/components/message/LinkGuardDialog.vue'
import MessageCard from '../../app/components/message/MessageCard.vue'
import { assessLink } from '../../shared/link-guard'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const msg = (over = {}) => ({
  id: '1',
  fromAddress: 'a@b.test',
  fromName: 'Ann',
  subject: 'S',
  sentAt: '2026-10-27T09:00:00Z',
  toJson: [{ address: 'me@x.test' }],
  ccJson: [],
  bodyText: 'plain body',
  bodyHtmlSanitized: null,
  attachmentNames: ['report.pdf'],
  ...over,
})
const stub = {
  MessageFrame: {
    props: ['html', 'loadImages'],
    template: '<div class="frame" :data-images="loadImages">{{ html }}</div>',
  },
}

describe('message components', () => {
  it('guard dialog lists risks, focuses cancel and confirms explicitly', async () => {
    const a = assessLink('http://1.2.3.4:8080/x', 'bank.com')!
    const w = mount(LinkGuardDialog, {
      props: { assessment: a },
      attachTo: document.body,
      global: { mocks: { $t: t } },
    })
    expect(w.attributes('role') ?? w.find('[role=alertdialog]').exists()).toBeTruthy()
    expect(w.findAll('li').length).toBeGreaterThanOrEqual(3)
    expect(document.activeElement?.textContent).toContain('Cancel')
    await w.findAll('button')[1]!.trigger('click')
    expect(w.emitted('open')![0]).toEqual(['http://1.2.3.4:8080/x'])
    w.unmount()
  })

  it('card shows plain text, attachment names only, and offers image loading when needed', async () => {
    const w = mount(MessageCard, {
      props: { message: msg(), expanded: true },
      global: { mocks: { $t: t }, stubs: stub },
    })
    expect(w.text()).toContain('plain body')
    expect(w.text()).toContain('report.pdf')
    expect(w.text()).toContain('not downloaded')
    const h = mount(MessageCard, {
      props: {
        message: msg({ bodyHtmlSanitized: '<img data-remote-src="https://x.test/a.png">' }),
        expanded: true,
      },
      global: { mocks: { $t: t }, stubs: stub },
    })
    expect(h.find('.frame').attributes('data-images')).toBe('false')
    await h
      .findAll('button')
      .find((b) => b.text() === 'Load images')!
      .trigger('click')
    expect(h.find('.frame').attributes('data-images')).toBe('true')
  })

  it('collapsed messages hide their body', () => {
    const w = mount(MessageCard, {
      props: { message: msg(), expanded: false },
      global: { mocks: { $t: t }, stubs: stub },
    })
    expect(w.text()).not.toContain('plain body')
  })
})
