// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import ConfirmDialog from '../../app/components/send/ConfirmDialog.vue'
import UndoBar from '../../app/components/send/UndoBar.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const mocks = { $t: t }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const preview = (o: object = {}) => ({
  from: { address: 'me@x.test', name: 'Me' },
  to: ['alex@acme.example'],
  cc: [],
  subject: 'Re: Q3',
  bodyText: 'Thanks.\n\nMe',
  placeholders: [],
  flags: { newRecipients: [], externalDomains: [], foreign: [] },
  contentHash: 'h'.repeat(64),
  ...o,
})
const mk = (props: object, attach = false) =>
  mount(ConfirmDialog, {
    props: { preview: preview(), needsPassword: false, ...props } as never,
    global: { mocks },
    attachTo: attach ? document.body : undefined,
  })

function scroll(
  w: ReturnType<typeof mk>,
  o: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  const el = w.find('[data-testid=body]').element as HTMLElement
  for (const [k, v] of Object.entries(o))
    Object.defineProperty(el, k, { value: v, configurable: true })
  return w.find('[data-testid=body]').trigger('scroll')
}

describe('ConfirmDialog', () => {
  it('shows recipients, subject and the full body, and starts with Cancel focused', () => {
    const w = mk({}, true)
    expect(w.text()).toContain('alex@acme.example')
    expect(w.text()).toContain('Re: Q3')
    expect(w.find('[data-testid=body]').text()).toBe('Thanks.\n\nMe')
    expect(document.activeElement?.textContent).toContain('Cancel')
    w.unmount()
  })

  it('Send stays disabled for a long message until the user has scrolled to the end', async () => {
    const w = mk({ preview: preview({ bodyText: 'Long message. '.repeat(100) }) })
    const send = () => w.findAll('button').find((b) => b.text() === 'Send')!
    await scroll(w, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 })
    expect(send().attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Scroll to the end')
    await scroll(w, { scrollHeight: 1000, clientHeight: 200, scrollTop: 790 })
    expect(send().attributes('disabled')).toBeDefined()
    await scroll(w, { scrollHeight: 1000, clientHeight: 200, scrollTop: 800 })
    expect(send().attributes('disabled')).toBeUndefined()
    await send().trigger('click')
    expect(w.emitted('confirm')![0]).toEqual([{ placeholderOverride: false }])
  })

  it('a short message needs no scrolling', async () => {
    const w = mk({})
    await flushPromises()
    expect(
      w
        .findAll('button')
        .find((b) => b.text() === 'Send')!
        .attributes('disabled'),
    ).toBeUndefined()
  })

  it('placeholders block sending until the user says so explicitly', async () => {
    const w = mk({ preview: preview({ placeholders: ['[confirm date]'] }) })
    const send = () => w.findAll('button').find((b) => b.text() === 'Send')!
    expect(w.text()).toContain('Unfilled placeholders: [confirm date]')
    expect(send().attributes('disabled')).toBeDefined()
    await w.find('input[type=checkbox]').setValue(true)
    expect(send().attributes('disabled')).toBeUndefined()
    await send().trigger('click')
    expect(w.emitted('confirm')![0]).toEqual([{ placeholderOverride: true }])
  })

  it('flags new recipients, outside domains and details not in the conversation', () => {
    const w = mk({
      preview: preview({
        flags: {
          newRecipients: ['x@y.test'],
          externalDomains: ['y.test'],
          foreign: [{ kind: 'link', value: 'https://evil.test' }],
        },
      }),
    })
    expect(w.text()).toContain('not on the conversation: x@y.test')
    expect(w.text()).toContain('outside your organisation: y.test')
    expect(w.text()).toContain('not in the conversation: https://evil.test')
  })

  it('asks for the password when two-factor is not set up, and clears it after sending', async () => {
    const w = mk({ needsPassword: true })
    await flushPromises()
    const send = () => w.findAll('button').find((b) => b.text() === 'Send')!
    expect(send().attributes('disabled')).toBeDefined()
    await w.find('#send-password').setValue('hunter2')
    await send().trigger('click')
    expect(w.emitted('confirm')![0]).toEqual([{ placeholderOverride: false, password: 'hunter2' }])
    expect((w.find('#send-password').element as HTMLInputElement).value).toBe('')
  })

  it('Escape cancels; busy disables Send; axe passes', async () => {
    const w = mk({ busy: true }, true)
    await flushPromises()
    expect(
      w
        .findAll('button')
        .find((b) => b.text() === 'Send')!
        .attributes('disabled'),
    ).toBeDefined()
    await w.find('[role=dialog]').trigger('keydown.esc')
    expect(w.emitted('cancel')).toBeTruthy()
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})

describe('UndoBar', () => {
  const nonce = 'a'.repeat(32)
  it('counts down from the server release time and Undo revokes', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    vi.stubGlobal('$fetch', async (url: string) => {
      calls.push(url)
      return url.endsWith('undo') ? { revoked: true } : { state: 'waiting' }
    })
    const w = mount(UndoBar, {
      props: { nonce, releaseAt: new Date(Date.now() + 5000).toISOString() },
      global: { mocks },
    })
    await flushPromises()
    expect(w.text()).toContain('Sending in 5 s')
    await vi.advanceTimersByTimeAsync(2000)
    expect(w.text()).toContain('Sending in 3 s')
    await w.find('button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Cancelled. Nothing was sent.')
    expect(w.emitted('done')![0]).toEqual(['cancelled'])
    expect(calls).toContain('/api/send/undo')
  })

  it('too late to undo: it shows what actually happened and stops polling at a final state', async () => {
    vi.useFakeTimers()
    let state = 'waiting'
    let polls = 0
    vi.stubGlobal('$fetch', async (url: string) => {
      if (url.endsWith('undo')) {
        state = 'sending'
        return { revoked: false }
      }
      polls++
      return { state }
    })
    const w = mount(UndoBar, {
      props: { nonce, releaseAt: new Date(Date.now() + 5000).toISOString() },
      global: { mocks },
    })
    await flushPromises()
    await w.find('button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Sending…')
    state = 'sent'
    await vi.advanceTimersByTimeAsync(1000)
    expect(w.text()).toContain('Sent.')
    expect(w.emitted('done')![0]).toEqual(['sent'])
    const n = polls
    await vi.advanceTimersByTimeAsync(5000)
    expect(polls).toBe(n)
  })

  it.each([
    ['unknown', 'uncertain'],
    ['failed', 'refused'],
    ['expired', 'expired'],
  ])('%s outcome is explained', async (state, word) => {
    vi.stubGlobal('$fetch', async () => ({ state }))
    const w = mount(UndoBar, {
      props: { nonce, releaseAt: new Date().toISOString() },
      global: { mocks },
    })
    await flushPromises()
    expect(w.text()).toContain(word)
  })

  it('unmounting does not cancel anything', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    vi.stubGlobal('$fetch', async (url: string) => {
      calls.push(url)
      return { state: 'waiting' }
    })
    const w = mount(UndoBar, {
      props: { nonce, releaseAt: new Date(Date.now() + 5000).toISOString() },
      global: { mocks },
    })
    await flushPromises()
    w.unmount()
    await vi.advanceTimersByTimeAsync(3000)
    expect(calls.some((c) => c.endsWith('undo'))).toBe(false)
  })
})
