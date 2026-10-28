import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkBaseUrl, openAiBody, openAiProvider } from '../../server/ai/openai/adapter'
import { fakeAiHttp } from '../helpers/fake-ai-http'

const fx = (n: string) => readFileSync(`tests/fixtures/ai/${n}.json`, 'utf8')
const schema = { name: 'triage', schema: { type: 'object', properties: { a: { type: 'string' } } } }
const req = { model: 'test-model-b', system: 'SYS', user: 'USER', maxTokens: 300, schema }

describe('openai adapter', () => {
  it('sends strict json_schema and parses usage including cached tokens', async () => {
    const { http, seen } = fakeAiHttp([{ text: fx('openai-ok') }])
    const r = await openAiProvider({ apiKey: 'sk-1', http }).complete(req)
    expect(r).toEqual({
      ok: true,
      value: {
        text: '{"results":[]}',
        stop: 'end',
        model: 'test-model-b',
        usage: { inputTokens: 200, outputTokens: 40, cachedTokens: 64 },
      },
    })
    const body = JSON.parse(seen[0]!.body!)
    expect(seen[0]!.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(seen[0]!.headers.authorization).toBe('Bearer sk-1')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.max_completion_tokens).toBe(300)
    expect(body.tools).toBeUndefined()
  })

  it('compatible servers: max_tokens, api-key header, custom base URL', async () => {
    const { http, seen } = fakeAiHttp([{ text: fx('openai-ok') }])
    await openAiProvider({
      kind: 'openai_compatible',
      apiKey: 'k',
      baseUrl: 'https://llm.example.com/v1/',
      options: { authHeader: 'api-key' },
      http,
    }).complete({ ...req, schema: undefined })
    expect(seen[0]!.url).toBe('https://llm.example.com/v1/chat/completions')
    expect(seen[0]!.headers['api-key']).toBe('k')
    const body = JSON.parse(seen[0]!.body!)
    expect(body.max_tokens).toBe(300)
    expect(body.response_format).toBeUndefined()
  })

  it('steps strict → json_object → prompt-only when the server rejects a mode, and remembers', async () => {
    const { http, seen } = fakeAiHttp([
      { status: 400 },
      { status: 400 },
      { text: fx('openai-ok') },
      { text: fx('openai-ok') },
    ])
    const p = openAiProvider({
      kind: 'openai_compatible',
      apiKey: 'k',
      baseUrl: 'https://llm.example.com/v1',
      http,
    })
    expect((await p.complete(req)).ok).toBe(true)
    const bodies = seen.map((s) => JSON.parse(s.body!))
    expect(bodies[0].response_format.type).toBe('json_schema')
    expect(bodies[1].response_format.type).toBe('json_object')
    expect(bodies[2].response_format).toBeUndefined()
    expect(bodies[2].messages[0].content).toContain('JSON Schema')
    await p.complete(req)
    expect(JSON.parse(seen[3]!.body!).response_format).toBeUndefined() // stays on prompt mode
  })

  it('does not step down on auth or rate-limit errors', async () => {
    const { http, seen } = fakeAiHttp([{ status: 401 }])
    const r = await openAiProvider({ apiKey: 'k', http }).complete(req)
    expect(r).toMatchObject({ ok: false, error: { kind: 'auth' } })
    expect(seen).toHaveLength(1)
  })

  it('maps finish reasons and refusals', async () => {
    const l = await openAiProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: fx('openai-length') }]).http,
    }).complete(req)
    expect(l.ok && l.value.stop).toBe('length')
    const f = await openAiProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: fx('openai-refusal') }]).http,
    }).complete(req)
    expect(f.ok && [f.value.stop, f.value.text]).toEqual(['refusal', ''])
  })

  it('lists models and maps transport failures', async () => {
    const m = await openAiProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: '{"data":[{"id":"x"}]}' }]).http,
    }).listModels()
    expect(m).toEqual({ ok: true, value: ['x'] })
    const boom = {
      request: async () => {
        throw new Error('reset')
      },
      stream: async () => {
        throw new Error('x')
      },
    }
    expect(await openAiProvider({ apiKey: 'k', http: boom }).listModels()).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
  })

  it('base URL policy: https and public hosts only', async () => {
    const pub = async () => ['93.184.216.34']
    expect(await checkBaseUrl('https://llm.example.com/v1/', pub)).toEqual({
      ok: true,
      value: 'https://llm.example.com/v1',
    })
    for (const bad of [
      'http://llm.example.com/v1',
      'https://user:pw@llm.example.com',
      'https://localhost:8080/v1',
      'ftp://x.test',
      'nope',
    ])
      expect(await checkBaseUrl(bad, pub)).toMatchObject({
        ok: false,
        error: { kind: 'validation', field: 'baseUrl' },
      })
    expect(
      await checkBaseUrl('https://internal.example.com', async () => ['10.0.0.3']),
    ).toMatchObject({ ok: false, error: { code: 'private_address' } })
  })

  it('prompt-only body embeds the schema in the system text', () => {
    const b = openAiBody(req, 'prompt', 'max_tokens')
    expect(b.messages[0]!.content).toContain('"properties"')
    expect('response_format' in b).toBe(false)
  })
})
