// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { menuRegistrar } from '../../thunderbird/src/menus.js'
import { send } from '../../thunderbird/src/ui.js'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('native menu registration', () => {
  it('uses valid contexts, awaits parents, and coalesces concurrent registration', async () => {
    const ids = new Set<string>()
    const create = vi.fn((props: { id: string; parentId?: string; contexts: string[] }, callback: () => void) => {
      expect(props.contexts.every((c) => ['message_list', 'message_display_action', 'page'].includes(c))).toBe(true)
      if (props.parentId) expect(ids.has(props.parentId)).toBe(true)
      queueMicrotask(() => { ids.add(props.id); callback() })
    })
    const report = vi.fn()
    const register = menuRegistrar({ menus: { removeAll: vi.fn(), create }, runtime: {} }, report)
    await Promise.all([register(), register()])
    expect(ids.has('sentinel-draft')).toBe(true)
    expect(create.mock.calls.length).toBe(ids.size)
    expect(report).toHaveBeenCalledWith({ state: 'ready' })
  })
  it('surfaces asynchronous registration errors', async () => {
    const report = vi.fn()
    await menuRegistrar({ menus: { removeAll: vi.fn(), create: (_: object, cb: () => void) => cb() }, runtime: { lastError: { message: 'Registration rejected' } } }, report)()
    expect(report).toHaveBeenCalledWith({ state: 'error', error: 'Registration rejected' })
  })
})
describe('background requests', () => {
  it('reports a missing background response', async () => {
    vi.stubGlobal('browser', { runtime: { sendMessage: async () => undefined } })
    await expect(send({ type: 'ping' })).rejects.toThrow('no response')
  })
  it('bounds a stalled response without claiming the job was cancelled', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('browser', { runtime: { sendMessage: () => new Promise(() => {}) } })
    const check = expect(send({ type: 'message-job-start' }, 100)).rejects.toThrow('check progress before retrying')
    await vi.advanceTimersByTimeAsync(100)
    await check
  })
})

it('shows draft progress immediately and recovers completion when storage events are missed', async () => {
  const { readFileSync } = await import('node:fs')
  document.body.innerHTML = readFileSync('thunderbird/src/popup.html', 'utf8').replace(/<link[^>]*>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
  const data: Record<string, unknown> = {
    'sentinel.triage:42': { needsReply: true, summary: 'Please reply', priority: 'p2_today', actionItems: [] },
  }
  let finishStart: (value: object) => void = () => {}
  vi.stubGlobal('browser', {
    storage: { local: { get: async (key: string) => ({ [key]: data[key] }) }, onChanged: { addListener: vi.fn() } },
    tabs: { query: async () => [{ id: 1 }] },
    messageDisplay: { getDisplayedMessages: async () => [{ id: 42, subject: 'Test', author: 'a@example.com' }] },
    runtime: { sendMessage: async (msg: { type: string }) => {
      if (msg.type === 'message-job-start') return new Promise((resolve) => { finishStart = resolve })
      if (msg.type === 'message-job-status') return { active: true }
      return { ok: true }
    } },
  })
  await import('../../thunderbird/src/popup.js')
  await vi.waitUntil(() => !!document.querySelector('[data-job-action="draft"]'))
  const button = document.querySelector<HTMLButtonElement>('[data-job-action="draft"]')!
  button.click()
  expect(button.disabled).toBe(true)
  expect(button.textContent).toBe('Saving AI draft…')
  expect(button.getAttribute('aria-busy')).toBe('true')
  data['sentinel.messageJob:42'] = { state: 'running', action: 'draft', stage: 'Generating reply…' }
  finishStart({ ok: true })
  await vi.waitUntil(() => document.getElementById('status')!.textContent!.includes('Generating reply'))
  data['sentinel.messageJob:42'] = { state: 'done', action: 'draft' }
  await vi.waitUntil(() => document.getElementById('status')!.textContent!.includes('Draft saved'), { timeout: 3000 })
  expect(document.querySelector<HTMLButtonElement>('[data-job-action="draft"]')!.disabled).toBe(false)
  window.dispatchEvent(new Event('unload'))
})
