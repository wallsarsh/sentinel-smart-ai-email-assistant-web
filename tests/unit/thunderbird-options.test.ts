// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('loads models into a dropdown and saves one default model for every feature', async () => {
  document.body.innerHTML = readFileSync('thunderbird/src/options.html', 'utf8')
    .replace(/<link[^>]*>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
  const data: Record<string, unknown> = {}
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }] }) }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('browser', {
    storage: { local: {
      get: async (k: string | null) => (k === null ? { ...data } : k in data ? { [k]: data[k] } : {}),
      set: async (v: Record<string, unknown>) => { Object.assign(data, v) },
      remove: async () => {},
    } },
    permissions: { contains: async () => true, request: async () => true },
    runtime: {},
  })
  await import('../../thunderbird/src/options.js')
  const $ = (id: string) => document.getElementById(id) as HTMLInputElement
  await vi.waitUntil(() => $('preset').options.length > 3)

  $('pbase').value = 'https://api.openai.com/v1'
  $('pkey').value = 'sk-test'
  $('load-models').click()
  await vi.waitUntil(() => $('model-status').textContent!.includes('2 models'))
  const select = $('pmodel-field').querySelector('select')!
  expect([...select.options].map((o) => o.value)).toEqual(['gpt-4o', 'gpt-4o-mini', '__other__'])
  select.value = 'gpt-4o'
  $('provider-form').dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitUntil(() => $('provider-status').textContent!.includes('saved'))

  // Models are remembered, so the routing dropdowns are populated without another request.
  const def = $('default-route').querySelectorAll('select')
  expect(def.length).toBe(2)
  expect([...def[1].options].map((o) => o.value)).toContain('gpt-4o-mini')
  def[1].value = 'gpt-4o-mini'
  def[1].dispatchEvent(new Event('change'))
  $('save-routes').click()
  await vi.waitUntil(() => $('route-status').textContent!.includes('saved'))
  const saved = data.settings as { defaultRoute: { model: string }; routes: Record<string, { model: string }>; customRoutes: string[] }
  expect(saved.defaultRoute.model).toBe('gpt-4o-mini')
  expect(saved.customRoutes).toEqual([])
  expect(Object.values(saved.routes).every((r) => r.model === 'gpt-4o-mini')).toBe(true)
})
