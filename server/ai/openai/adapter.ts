import { checkUrl, SsrfError, type Resolver } from '../../http/ssrf'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { failureForStatus, guardedHttp } from '../http'
import type { AiHttp, AiKind, AiProvider, AiRequest, AiResponse, StopReason } from '../types'

export const OPENAI_BASE = 'https://api.openai.com/v1'

/** How to ask for JSON. Servers differ; the adapter steps down when one rejects a mode. */
export type StructuredMode = 'strict' | 'json_object' | 'prompt'
const LADDER: StructuredMode[] = ['strict', 'json_object', 'prompt']

export type OpenAiOptions = {
  structured?: StructuredMode
  /** `authorization` (Bearer) or `api-key` (Azure style). */
  authHeader?: 'authorization' | 'api-key'
  /** OpenAI proper wants max_completion_tokens; many compatible servers only know max_tokens. */
  tokensParam?: 'max_completion_tokens' | 'max_tokens'
}

type Body = {
  model?: string
  choices?: {
    message?: { content?: string | null; refusal?: string | null }
    finish_reason?: string
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
  data?: { id: string }[]
}

const FINISH: Record<string, StopReason> = {
  stop: 'end',
  length: 'length',
  content_filter: 'refusal',
}

/** Validates a user-entered base URL: https, no credentials, resolves only to public addresses. */
export async function checkBaseUrl(
  raw: string,
  resolver?: Resolver,
): Promise<Result<string, AppFailure>> {
  try {
    const { url } = await checkUrl(raw, {}, resolver)
    return ok(url.toString().replace(/\/$/, ''))
  } catch (e) {
    return err({
      kind: 'validation',
      field: 'baseUrl',
      code: e instanceof SsrfError ? e.code : 'bad_host',
    })
  }
}

export function openAiBody(
  req: AiRequest,
  mode: StructuredMode,
  tokensParam: NonNullable<OpenAiOptions['tokensParam']>,
  stream = false,
) {
  const system =
    req.schema && mode === 'prompt'
      ? `${req.system}\n\nRespond with a single JSON object that matches this JSON Schema. No prose, no code fences.\n${JSON.stringify(req.schema.schema)}`
      : req.system
  return {
    model: req.model,
    [tokensParam]: req.maxTokens,
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: req.user },
    ],
    ...(req.schema && mode === 'strict'
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.schema.name, schema: req.schema.schema, strict: true },
          },
        }
      : req.schema && mode === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  }
}

export function parseOpenAi(b: Body): AiResponse {
  const c = b.choices?.[0]
  return {
    text: c?.message?.content ?? '',
    stop: c?.message?.refusal ? 'refusal' : (FINISH[c?.finish_reason ?? ''] ?? 'other'),
    model: b.model ?? '',
    usage: {
      inputTokens: b.usage?.prompt_tokens ?? 0,
      outputTokens: b.usage?.completion_tokens ?? 0,
      cachedTokens: b.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  }
}

export const openAiHeaders = (key: string, o: OpenAiOptions) => ({
  'content-type': 'application/json',
  ...(o.authHeader === 'api-key' ? { 'api-key': key } : { authorization: `Bearer ${key}` }),
})

export function openAiProvider(o: {
  kind?: Extract<AiKind, 'openai' | 'openai_compatible'>
  apiKey: string
  baseUrl?: string
  options?: OpenAiOptions
  http?: AiHttp
}): AiProvider {
  const kind = o.kind ?? 'openai'
  const base = (o.baseUrl ?? OPENAI_BASE).replace(/\/$/, '')
  const http = o.http ?? guardedHttp()
  const tokensParam =
    o.options?.tokensParam ?? (kind === 'openai' ? 'max_completion_tokens' : 'max_tokens')
  let mode: StructuredMode = o.options?.structured ?? 'strict'

  async function post(req: AiRequest, m: StructuredMode): Promise<Result<AiResponse, AppFailure>> {
    let res
    try {
      res = await http.request(`${base}/chat/completions`, {
        headers: openAiHeaders(o.apiKey, o.options ?? {}),
        body: JSON.stringify(openAiBody(req, m, tokensParam)),
        signal: req.signal,
      })
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
      return ok(parseOpenAi(JSON.parse(res.text) as Body))
    } catch {
      return err({ kind: 'provider', status: res.status, code: 'bad_json' })
    }
  }

  return {
    kind,
    async complete(req) {
      let r = await post(req, mode)
      // 400 on a structured request usually means the server lacks that mode: step down once per mode.
      while (
        !r.ok &&
        req.schema &&
        r.error.kind === 'provider' &&
        r.error.status === 400 &&
        mode !== 'prompt'
      ) {
        mode = LADDER[LADDER.indexOf(mode) + 1]!
        r = await post(req, mode)
      }
      return r
    },
    async listModels() {
      let res
      try {
        res = await http.request(`${base}/models`, {
          method: 'GET',
          headers: openAiHeaders(o.apiKey, o.options ?? {}),
        })
      } catch {
        return err({ kind: 'network' })
      }
      if (res.status !== 200)
        return err(failureForStatus(res.status, res.headers.get('retry-after')))
      try {
        return ok(((JSON.parse(res.text) as Body).data ?? []).map((m) => m.id))
      } catch {
        return err({ kind: 'provider', status: 200, code: 'bad_json' })
      }
    },
  }
}
