import { describe, expect, it } from 'vitest'
import { anthropicProvider } from '../../server/ai/anthropic'
import { openAiProvider } from '../../server/ai/openai/adapter'
import { parseSse } from '../../shared/sse-parser'
import { AiStreamError, type AiHttp, type StreamEvent } from '../../server/ai/types'
import { fakeAiHttp } from '../helpers/fake-ai-http'

const enc = new TextEncoder()
async function* gen(bytes: Uint8Array[]) {
  for (const b of bytes) yield b
}
const collect = async (it: AsyncIterable<unknown>) => {
  const o = []
  for await (const x of it) o.push(x)
  return o
}
const bytesOf = (s: string, size: number) => {
  const b = enc.encode(s)
  return Array.from({ length: Math.ceil(b.length / size) }, (_, i) =>
    b.slice(i * size, (i + 1) * size),
  )
}

describe('sse parser', () => {
  const text =
    'event: a\ndata: {"x":1}\n\n: comment\ndata: line1\ndata: line2\n\nid: 7\ndata: ünïcode 🙂\n\n'
  const expected = [
    { event: 'a', data: '{"x":1}', id: undefined },
    { event: undefined, data: 'line1\nline2', id: undefined },
    { event: undefined, data: 'ünïcode 🙂', id: '7' },
  ]

  it.each([1, 2, 3, 5, 7, 64, 10_000])(
    'is chunk-size independent (%i bytes, splitting UTF-8)',
    async (n) => {
      expect(await collect(parseSse(gen(bytesOf(text, n))))).toEqual(expected)
    },
  )

  it('handles CRLF and CR endings, split CRLF, and a final event without blank line', async () => {
    const crlf = 'data: a\r\n\r\ndata: b\r\rdata: c'
    for (const n of [1, 4, 100])
      expect(
        (await collect(parseSse(gen(bytesOf(crlf, n))))).map((e) => (e as { data: string }).data),
      ).toEqual(['a', 'b', 'c'])
  })

  it('ignores empty and comment-only input', async () => {
    expect(await collect(parseSse(gen([])))).toEqual([])
    expect(await collect(parseSse(gen(bytesOf(': ping\n\n', 3))))).toEqual([])
  })
})

const anthropicSse = [
  'event: message_start\ndata: {"type":"message_start","message":{"model":"test-model-a","usage":{"input_tokens":80,"cache_read_input_tokens":10}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
]
const req = { model: 'test-model-a', system: 's', user: 'u', maxTokens: 100 }

describe('streaming adapters', () => {
  it('anthropic yields deltas then done with usage', async () => {
    const { http } = fakeAiHttp([{ chunks: anthropicSse }])
    const ev = (await collect(
      anthropicProvider({ apiKey: 'k', http }).stream!(req),
    )) as StreamEvent[]
    expect(ev.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)).toEqual([
      'Hel',
      'lo',
    ])
    expect(ev.at(-1)).toEqual({
      type: 'done',
      response: {
        text: 'Hello',
        stop: 'end',
        model: 'test-model-a',
        usage: { inputTokens: 80, outputTokens: 12, cachedTokens: 10 },
      },
    })
  })

  it('openai yields deltas, then usage and stop from the final chunks', async () => {
    const chunks = [
      'data: {"model":"test-model-b","choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]
    const { http, seen } = fakeAiHttp([{ chunks }])
    const ev = (await collect(openAiProvider({ apiKey: 'k', http }).stream!(req))) as StreamEvent[]
    expect(ev.at(-1)).toEqual({
      type: 'done',
      response: {
        text: 'Hi there',
        stop: 'end',
        model: 'test-model-b',
        usage: { inputTokens: 9, outputTokens: 3, cachedTokens: 2 },
      },
    })
    expect(JSON.parse(seen[0]!.body!).stream_options).toEqual({ include_usage: true })
  })

  it('throws typed failures for HTTP errors and in-stream errors', async () => {
    const e1 = await collect(
      anthropicProvider({
        apiKey: 'k',
        http: fakeAiHttp([{ status: 429, headers: { 'retry-after': '3' } }]).http,
      }).stream!(req),
    ).catch((e) => e)
    expect(e1).toBeInstanceOf(AiStreamError)
    expect((e1 as AiStreamError).failure).toEqual({ kind: 'rate_limited', retryAfterSeconds: 3 })
    const e2 = await collect(
      anthropicProvider({
        apiKey: 'k',
        http: fakeAiHttp([
          { chunks: ['data: {"type":"error","error":{"type":"overloaded_error"}}\n\n'] },
        ]).http,
      }).stream!(req),
    ).catch((e) => e)
    expect((e2 as AiStreamError).failure.kind).toBe('provider')
  })

  it('stopping early closes the upstream request', async () => {
    let closed = false
    const http: AiHttp = {
      request: async () => {
        throw new Error('x')
      },
      stream: async () => ({
        status: 200,
        headers: new Headers(),
        body: gen(anthropicSse.map((s) => enc.encode(s))),
        text: async () => '',
        close: () => void (closed = true),
      }),
    }
    const it = anthropicProvider({ apiKey: 'k', http }).stream!(req)
    await it.next() // first delta
    await it.return()
    expect(closed).toBe(true)
  })
})
