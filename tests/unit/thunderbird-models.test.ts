import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS modules
import { chatModels, listModels, modelsRequest, parseModels } from '../../thunderbird/src/models.js'
// @ts-expect-error plain JS modules
import { normalizeSettings, mergeSettings } from '../../thunderbird/src/config.js'
// @ts-expect-error plain JS modules
import { resolveRoute } from '../../thunderbird/src/ai.js'

const res = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response

describe('model listing', () => {
  it('builds provider-specific requests', () => {
    expect(modelsRequest({ kind: 'openai', baseUrl: 'https://api.openai.com/v1/', apiKey: 'k' })).toEqual({
      url: 'https://api.openai.com/v1/models',
      headers: { authorization: 'Bearer k' },
    })
    const a = modelsRequest({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k' })
    expect(a.url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(a.headers).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01' })
    expect(modelsRequest({ kind: 'openai_compatible', baseUrl: 'http://localhost:11434/v1' }).headers).toEqual({})
  })

  it('parses OpenAI, Gemini and Ollama shapes and hides non-chat models', () => {
    expect(parseModels({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] })).toEqual(['a', 'b'])
    expect(parseModels({ data: [{ id: 'models/gemini-2.5-flash' }] })).toEqual(['gemini-2.5-flash'])
    expect(parseModels({ models: [{ name: 'llama3.2' }] })).toEqual(['llama3.2'])
    expect(chatModels(['gpt-4o', 'text-embedding-3-small', 'whisper-1'])).toEqual(['gpt-4o'])
    expect(chatModels(['text-embedding-3-small'])).toEqual(['text-embedding-3-small'])
    expect(parseModels(null)).toEqual([])
  })

  it('returns readable errors instead of throwing', async () => {
    const p = { kind: 'openai', baseUrl: 'https://x/v1', apiKey: 'k' }
    expect(await listModels(p, async () => res(200, { data: [{ id: 'm1' }] }))).toEqual({ ok: true, models: ['m1'] })
    expect(await listModels(p, async () => res(401, {}))).toMatchObject({ ok: false, error: /API key/ })
    expect(await listModels(p, async () => res(404, {}))).toMatchObject({ ok: false, error: /manually/ })
    expect(await listModels(p, async () => { throw new Error('down') })).toMatchObject({ ok: false, error: /reach/ })
    expect(await listModels({ kind: 'openai', baseUrl: '' })).toMatchObject({ ok: false })
  })
})

describe('default model for every feature', () => {
  const providers = [
    { id: 'a', name: 'A', kind: 'openai', baseUrl: 'https://a', apiKey: 'k', model: 'a1' },
    { id: 'b', name: 'B', kind: 'anthropic', baseUrl: 'https://b', apiKey: 'k', model: 'b1' },
  ]

  it('applies the default route to every task unless it is customised', () => {
    const s = normalizeSettings({ providers, defaultRoute: { providerId: 'b', model: 'b-big' } })
    for (const t of ['triage', 'brief', 'draft', 'proofread', 'rewrite'])
      expect(resolveRoute(s, t)).toMatchObject({ provider: { id: 'b' }, model: 'b-big' })
    expect(s.defaultProviderId).toBe('b')
  })

  it('keeps per-task overrides and follows later default changes for the rest', () => {
    let s = normalizeSettings({ providers })
    s = normalizeSettings(
      mergeSettings(s, {
        defaultRoute: { providerId: 'a', model: 'a2' },
        customRoutes: ['draft'],
        routes: { draft: { providerId: 'b', model: 'b-draft' } },
      }),
    )
    expect(resolveRoute(s, 'draft')).toMatchObject({ provider: { id: 'b' }, model: 'b-draft' })
    expect(resolveRoute(s, 'triage')).toMatchObject({ provider: { id: 'a' }, model: 'a2' })
    s = normalizeSettings(mergeSettings(s, { defaultRoute: { providerId: 'a', model: 'a3' } }))
    expect(resolveRoute(s, 'brief').model).toBe('a3')
    expect(resolveRoute(s, 'draft').model).toBe('b-draft')
  })

  it('upgrades old settings: differing routes stay custom, matching ones follow the default', () => {
    const s = normalizeSettings({
      providers,
      defaultProviderId: 'a',
      routes: { triage: { providerId: 'a', model: 'a1' }, draft: { providerId: 'b', model: 'b9' } },
    })
    expect(s.customRoutes).toEqual(['draft'])
    expect(s.defaultRoute).toEqual({ providerId: 'a', model: 'a1' })
  })

  it('falls back to the first provider when the default one is removed', () => {
    const s = normalizeSettings({ providers: [providers[1]], defaultRoute: { providerId: 'a', model: 'zzz' } })
    expect(s.defaultRoute).toEqual({ providerId: 'b', model: 'b1' })
  })
})
