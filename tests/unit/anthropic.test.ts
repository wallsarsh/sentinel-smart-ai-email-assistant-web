import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { anthropicBody, anthropicProvider } from '../../server/ai/anthropic'
import { failureForStatus } from '../../server/ai/http'
import { fakeAiHttp } from '../helpers/fake-ai-http'

const fx = (n: string) => readFileSync(`tests/fixtures/ai/${n}.json`, 'utf8')
const req = { model: 'test-model-a', system: 'SYS', user: 'USER', maxTokens: 500 }

describe('anthropic adapter', () => {
  it('parses text, usage and stop reason from a recorded response', async () => {
    const { http, seen } = fakeAiHttp([{ text: fx('anthropic-ok') }])
    const r = await anthropicProvider({ apiKey: 'sk-test', http }).complete({
      ...req,
      schema: { name: 'x', schema: { type: 'object' } },
    })
    expect(r).toEqual({
      ok: true,
      value: {
        text: '{"results":[]}',
        stop: 'end',
        model: 'test-model-a',
        usage: { inputTokens: 120, outputTokens: 30, cachedTokens: 100 },
      },
    })
    expect(seen[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(seen[0]!.headers['x-api-key']).toBe('sk-test')
    const body = JSON.parse(seen[0]!.body!)
    expect(body.output_config.format).toEqual({ type: 'json_schema', schema: { type: 'object' } })
    expect(body.tools).toBeUndefined()
    expect(body.messages).toEqual([{ role: 'user', content: 'USER' }])
  })

  it('reports truncation and refusals via the stop reason', async () => {
    const t = await anthropicProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: fx('anthropic-truncated') }]).http,
    }).complete(req)
    expect(t.ok && t.value.stop).toBe('length')
    const r = await anthropicProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: fx('anthropic-refusal') }]).http,
    }).complete(req)
    expect(r.ok && [r.value.stop, r.value.text]).toEqual(['refusal', ''])
  })

  it('maps HTTP errors to failures without provider text', async () => {
    const run = async (status: number, headers = {}) =>
      anthropicProvider({
        apiKey: 'k',
        http: fakeAiHttp([{ status, text: '{"error":{"message":"secret user@x.test"}}', headers }])
          .http,
      }).complete(req)
    expect(await run(401)).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'invalid_credentials', code: '401' },
    })
    expect(await run(429, { 'retry-after': '12' })).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: 12 },
    })
    expect(await run(529)).toEqual({
      ok: false,
      error: { kind: 'provider', status: 529, code: '529' },
    })
    expect(JSON.stringify(await run(500))).not.toContain('secret')
    expect(failureForStatus(404)).toEqual({ kind: 'not_found' })
  })

  it('maps transport errors and blocked hosts', async () => {
    const boom = {
      request: async () => {
        throw new Error('socket hang up')
      },
      stream: async () => {
        throw new Error('x')
      },
    }
    expect(await anthropicProvider({ apiKey: 'k', http: boom }).complete(req)).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    const blocked = {
      ...boom,
      request: async () => {
        throw new Error('blocked: private_address')
      },
    }
    expect(
      await anthropicProvider({ apiKey: 'k', baseUrl: 'https://10.0.0.1', http: blocked }).complete(
        req,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'validation', code: 'private_address' } })
  })

  it('handles garbage bodies and lists models', async () => {
    expect(
      await anthropicProvider({
        apiKey: 'k',
        http: fakeAiHttp([{ text: 'not json' }]).http,
      }).complete(req),
    ).toMatchObject({ ok: false, error: { code: 'bad_json' } })
    const m = await anthropicProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ text: '{"data":[{"id":"a"},{"id":"b"}]}' }]).http,
    }).listModels()
    expect(m).toEqual({ ok: true, value: ['a', 'b'] })
  })

  it('sends the browser-access header only for browser callers', async () => {
    const browser = fakeAiHttp([{ text: fx('anthropic-ok') }])
    await anthropicProvider({ apiKey: 'k', browser: true, http: browser.http }).complete(req)
    expect(browser.seen[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const server = fakeAiHttp([{ text: fx('anthropic-ok') }])
    await anthropicProvider({ apiKey: 'k', http: server.http }).complete(req)
    expect(server.seen[0]!.headers).not.toHaveProperty('anthropic-dangerous-direct-browser-access')
  })

  it('reports an organization that forbids browser calls separately from a bad key', async () => {
    const cors = anthropicProvider({
      apiKey: 'k',
      browser: true,
      http: fakeAiHttp([
        {
          status: 401,
          text: '{"type":"error","error":{"type":"authentication_error","message":"CORS requests are not allowed for this Organization because of its settings."}}',
        },
      ]).http,
    })
    expect(await cors.complete(req)).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'invalid_credentials', code: 'browser_blocked' },
    })
    const badKey = anthropicProvider({
      apiKey: 'k',
      http: fakeAiHttp([{ status: 401, text: '{"error":{"type":"authentication_error"}}' }]).http,
    })
    expect(await badKey.complete(req)).toMatchObject({ ok: false, error: { code: '401' } })
  })

  it('omits temperature unless set', () => {
    expect('temperature' in anthropicBody(req)).toBe(false)
    expect(anthropicBody({ ...req, temperature: 0.2 }).temperature).toBe(0.2)
    expect(anthropicBody(req, true).stream).toBe(true)
  })
})
