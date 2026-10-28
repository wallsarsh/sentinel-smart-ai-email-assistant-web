import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { failureForStatus, guardedHttp } from './http'
import { parseSse } from './sse-parser'
import {
  AiStreamError,
  type AiHttp,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type StopReason,
  type StreamEvent,
} from './types'

const VERSION = '2023-06-01'
export const ANTHROPIC_BASE = 'https://api.anthropic.com'

type Body = {
  content?: { type: string; text?: string }[]
  stop_reason?: string
  model?: string
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
  data?: { id: string }[]
}

type StreamJson = {
  type?: string
  message?: { model?: string; usage?: { input_tokens?: number; cache_read_input_tokens?: number } }
  delta?: { type?: string; text?: string; stop_reason?: string }
  usage?: { output_tokens?: number }
  error?: { type?: string }
}

const STOP: Record<string, StopReason> = {
  end_turn: 'end',
  stop_sequence: 'end',
  max_tokens: 'length',
  refusal: 'refusal',
}

export const anthropicHeaders = (apiKey: string) => ({
  'x-api-key': apiKey,
  'anthropic-version': VERSION,
  'content-type': 'application/json',
})

/** The JSON body for a Messages call. No tools are offered; structured replies use JSON-schema output. */
export function anthropicBody(req: AiRequest, stream = false) {
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
    ...(req.schema
      ? { output_config: { format: { type: 'json_schema', schema: req.schema.schema } } }
      : {}),
    ...(stream ? { stream: true } : {}),
  }
}

export function parseAnthropic(b: Body): AiResponse {
  return {
    text: (b.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join(''),
    stop: STOP[b.stop_reason ?? ''] ?? 'other',
    model: b.model ?? '',
    usage: {
      inputTokens: b.usage?.input_tokens ?? 0,
      outputTokens: b.usage?.output_tokens ?? 0,
      cachedTokens: b.usage?.cache_read_input_tokens ?? 0,
    },
  }
}

export function anthropicProvider(o: {
  apiKey: string
  baseUrl?: string
  http?: AiHttp
}): AiProvider {
  const base = (o.baseUrl ?? ANTHROPIC_BASE).replace(/\/$/, '')
  const http = o.http ?? guardedHttp()

  async function call(
    url: string,
    init: Parameters<AiHttp['request']>[1],
  ): Promise<Result<Body, AppFailure>> {
    let res
    try {
      res = await http.request(url, init)
    } catch (e) {
      return err(
        e instanceof Error && e.message.startsWith('blocked:')
          ? { kind: 'validation', field: 'baseUrl', code: 'private_address' }
          : { kind: 'network' },
      )
    }
    if (res.status < 200 || res.status >= 300)
      return err(failureForStatus(res.status, res.headers.get('retry-after')))
    try {
      return ok(JSON.parse(res.text) as Body)
    } catch {
      return err({ kind: 'provider', status: res.status, code: 'bad_json' })
    }
  }

  return {
    kind: 'anthropic',
    async complete(req) {
      const r = await call(`${base}/v1/messages`, {
        headers: anthropicHeaders(o.apiKey),
        body: JSON.stringify(anthropicBody(req)),
        signal: req.signal,
      })
      return r.ok ? ok(parseAnthropic(r.value)) : r
    },
    async *stream(req): AsyncGenerator<StreamEvent, void, void> {
      let res
      try {
        res = await http.stream(`${base}/v1/messages`, {
          headers: anthropicHeaders(o.apiKey),
          body: JSON.stringify(anthropicBody(req, true)),
          signal: req.signal,
        })
      } catch (e) {
        throw new AiStreamError(
          e instanceof Error && e.message.startsWith('blocked:')
            ? { kind: 'validation', field: 'baseUrl', code: 'private_address' }
            : { kind: 'network' },
        )
      }
      try {
        if (res.status < 200 || res.status >= 300)
          throw new AiStreamError(failureForStatus(res.status, res.headers.get('retry-after')))
        let text = ''
        let model = ''
        let stop: StopReason = 'other'
        const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
        for await (const ev of parseSse(res.body)) {
          let j: StreamJson
          try {
            j = JSON.parse(ev.data)
          } catch {
            continue
          }
          if (j.type === 'message_start') {
            model = j.message?.model ?? model
            usage.inputTokens = j.message?.usage?.input_tokens ?? 0
            usage.cachedTokens = j.message?.usage?.cache_read_input_tokens ?? 0
          } else if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
            const t = j.delta.text ?? ''
            text += t
            yield { type: 'delta', text: t }
          } else if (j.type === 'message_delta') {
            stop = STOP[j.delta?.stop_reason ?? ''] ?? stop
            usage.outputTokens = j.usage?.output_tokens ?? usage.outputTokens
          } else if (j.type === 'error') {
            throw new AiStreamError(
              j.error?.type === 'rate_limit_error'
                ? { kind: 'rate_limited' }
                : { kind: 'provider', status: 529, code: 'stream_error' },
            )
          } else if (j.type === 'message_stop') break
        }
        yield { type: 'done', response: { text, usage, stop, model } }
      } finally {
        res.close() // also runs when the consumer stops early: cancels the upstream request
      }
    },
    async listModels() {
      const r = await call(`${base}/v1/models?limit=100`, {
        method: 'GET',
        headers: anthropicHeaders(o.apiKey),
      })
      return r.ok ? ok((r.value.data ?? []).map((m) => m.id)) : r
    },
  }
}
