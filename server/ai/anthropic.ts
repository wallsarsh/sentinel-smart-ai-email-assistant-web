import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { failureForStatus, guardedHttp } from './http'
import type { AiHttp, AiProvider, AiRequest, AiResponse, StopReason } from './types'

const VERSION = '2023-06-01'
export const ANTHROPIC_BASE = 'https://api.anthropic.com'

type Body = {
  content?: { type: string; text?: string }[]
  stop_reason?: string
  model?: string
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
  data?: { id: string }[]
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
    async listModels() {
      const r = await call(`${base}/v1/models?limit=100`, {
        method: 'GET',
        headers: anthropicHeaders(o.apiKey),
      })
      return r.ok ? ok((r.value.data ?? []).map((m) => m.id)) : r
    },
  }
}
