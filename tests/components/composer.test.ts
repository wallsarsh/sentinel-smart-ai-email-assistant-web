// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import DraftEditor from '../../app/components/composer/DraftEditor.vue'
import RecipientList from '../../app/components/composer/RecipientList.vue'
import ToneIntent from '../../app/components/composer/ToneIntent.vue'
import { draftStore, streamDraft, type DraftStreamEvent } from '../../app/utils/draft-stream'
import { highlightSegments } from '../../shared/draft-scan'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const global = { mocks: { $t: t } }

describe('highlightSegments', () => {
  it('marks placeholders and foreign details, leaving thread details alone', () => {
    const segs = highlightSegments('Hi [name], mail eve@evil.test or alex@acme.example.', [
      'alex@acme.example',
    ])
    expect(segs.filter((s) => s.kind !== 'text').map((s) => [s.kind, s.text])).toEqual([
      ['placeholder', '[name]'],
      ['email', 'eve@evil.test'],
    ])
    expect(segs.map((s) => s.text).join('')).toBe(
      'Hi [name], mail eve@evil.test or alex@acme.example.',
    )
  })
  it('plain text is one segment; empty is none', () => {
    expect(highlightSegments('hello', [])).toEqual([{ text: 'hello', kind: 'text' }])
    expect(highlightSegments('', [])).toEqual([])
  })
})

describe('DraftEditor', () => {
  it('switches Generate and Stop, locks the text while streaming, and flags details to check', async () => {
    const w = mount(DraftEditor, {
      props: { modelValue: 'Hi [confirm date] see https://evil.test', known: [], streaming: false },
      global,
    })
    expect(w.text()).toContain('Write a draft with AI')
    expect(w.find('[data-testid=preview]').findAll('mark')).toHaveLength(2)
    expect(w.find('mark').text()).toContain('Fill in')
    await w.findAll('button')[0]!.trigger('click')
    expect(w.emitted('generate')).toBeTruthy()
    await w.setProps({ streaming: true })
    expect(w.find('textarea').attributes('readonly')).toBeDefined()
    expect(w.text()).toContain('Stop')
    expect(w.find('[data-testid=preview]').exists()).toBe(false)
    await w.findAll('button')[0]!.trigger('click')
    expect(w.emitted('stop')).toBeTruthy()
  })
  it('is accessible (axe)', async () => {
    const w = mount(DraftEditor, {
      props: { modelValue: 'Hi [x1]', known: [], streaming: false },
      attachTo: document.body,
      global,
    })
    const r = await axe.run(w.element as HTMLElement, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(r.violations.map((v) => v.id)).toEqual([])
    w.unmount()
  })
})

describe('RecipientList and ToneIntent', () => {
  it('adds valid addresses (lower-cased, de-duplicated), rejects invalid ones, removes', async () => {
    const w = mount(RecipientList, {
      props: { id: 'to', label: 'To', modelValue: ['a@x.test'] },
      global,
    })
    const input = w.find('input')
    await input.setValue('Bob@X.test')
    await input.trigger('keydown.enter')
    expect(w.emitted('update:modelValue')![0]![0]).toEqual(['a@x.test', 'bob@x.test'])
    await input.setValue('not-an-address')
    await input.trigger('keydown.enter')
    expect(w.find('[role=alert]').text()).toContain('valid email')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
    await input.setValue('a@x.test')
    await input.trigger('keydown.enter')
    expect(w.emitted('update:modelValue')).toHaveLength(1) // duplicate ignored
    await w.find('li button').trigger('click')
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual([])
  })
  it('exposes tone and intent as radio groups with checked state', async () => {
    const w = mount(ToneIntent, {
      props: { tone: 'friendly', intent: 'accept', instruction: '' },
      global,
    })
    expect(w.findAll('[role=radio][aria-checked=true]').map((b) => b.text())).toEqual([
      'Friendly',
      'Accept',
    ])
    await w
      .findAll('[role=radio]')
      .find((b) => b.text() === 'Formal')!
      .trigger('click')
    expect(w.emitted('update:tone')![0]).toEqual(['formal'])
    await w.find('textarea').setValue('be brief')
    expect(w.emitted('update:instruction')![0]).toEqual(['be brief'])
  })
})

describe('draft stream and autosave', () => {
  const enc = new TextEncoder()
  const body = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)))
        c.close()
      },
    })

  it('parses delta, done and error events from the SSE stream (split chunks)', async () => {
    const sse =
      'event: delta\ndata: {"type":"delta","text":"Hi"}\n\nevent: done\ndata: {"type":"done","text":"Hi there","placeholders":[],"foreign":[],"promptVersion":"draft.v1","model":"m"}\n\n'
    const events: DraftStreamEvent[] = []
    const h = streamDraft(
      { messageId: 'm', tone: 'friendly', intent: 'accept' },
      (e) => events.push(e),
      {
        fetchFn: async () => ({
          ok: true,
          status: 200,
          body: body([sse.slice(0, 30), sse.slice(30)]),
          json: async () => ({}),
        }),
      },
    )
    await h.finished
    expect(events.map((e) => e.type)).toEqual(['delta', 'done'])
    const errs: DraftStreamEvent[] = []
    await streamDraft({ messageId: 'm', tone: 'x', intent: 'y' }, (e) => errs.push(e), {
      fetchFn: async () => ({
        ok: false,
        status: 429,
        body: null,
        json: async () => ({ error: { kind: 'cap_reached', detail: { scope: 'tokens' } } }),
      }),
    }).finished
    expect(errs[0]).toEqual({
      type: 'error',
      failure: { kind: 'cap_reached', detail: { scope: 'tokens' } },
    })
  })

  it('stop aborts the request immediately and reports nothing', async () => {
    let signal: AbortSignal | undefined
    const events: DraftStreamEvent[] = []
    const h = streamDraft({ messageId: 'm', tone: 'x', intent: 'y' }, (e) => events.push(e), {
      fetchFn: (_u, init) =>
        new Promise((_res, rej) => {
          signal = init.signal
          init.signal.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    })
    h.stop()
    await h.finished
    expect(signal!.aborted).toBe(true)
    expect(events).toEqual([])
  })

  it('network failures are reported as a failure, not thrown', async () => {
    const events: DraftStreamEvent[] = []
    await streamDraft({ messageId: 'm', tone: 'x', intent: 'y' }, (e) => events.push(e), {
      fetchFn: async () => {
        throw new Error('offline')
      },
    }).finished
    expect(events).toEqual([{ type: 'error', failure: { kind: 'network' } }])
  })

  it('autosave restores after a reload and survives broken storage', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
    const draft = {
      text: 'Hello',
      tone: 'friendly',
      intent: 'accept',
      instruction: 'short',
      to: ['a@x.test'],
      cc: [],
      mode: 'reply' as const,
    }
    draftStore(storage).save('m1', draft)
    expect(draftStore(storage).load('m1')).toEqual(draft) // a fresh store instance = a reload
    expect(draftStore(storage).load('m2')).toBeNull()
    draftStore(storage).clear('m1')
    expect(draftStore(storage).load('m1')).toBeNull()
    const bad = {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      },
      removeItem: () => {
        throw new Error('x')
      },
    }
    expect(draftStore(bad).load('m1')).toBeNull()
    expect(() => draftStore(bad).save('m1', draft)).not.toThrow()
    expect(() => draftStore(null).clear('m1')).not.toThrow()
    storage.setItem('sentinel.draft.m9', '{"text":5}')
    expect(draftStore(storage).load('m9')).toBeNull()
  })
})
