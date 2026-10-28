import type { Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'

export type AiTask = 'triage' | 'brief' | 'draft' | 'repair' | 'default'
export type AiKind = 'anthropic' | 'openai' | 'openai_compatible'

export type AiRequest = {
  /** Chosen by the user or catalog; never hard-coded. */
  model: string
  /** Static, reviewed prompt text. */
  system: string
  /** Built by PromptBuilder; the only place mail content enters. */
  user: string
  maxTokens: number
  temperature?: number
  /** When set, the reply must be JSON matching this JSON Schema. */
  schema?: { name: string; schema: Record<string, unknown> }
  signal?: AbortSignal
}

export type AiUsage = { inputTokens: number; outputTokens: number; cachedTokens: number }
export type StopReason = 'end' | 'length' | 'refusal' | 'other'

export type AiResponse = { text: string; usage: AiUsage; stop: StopReason; model: string }

export type StreamEvent = { type: 'delta'; text: string } | { type: 'done'; response: AiResponse }

/** Provider-neutral model access. No tools or functions are ever offered to the model. */
export interface AiProvider {
  readonly kind: AiKind
  complete(req: AiRequest): Promise<Result<AiResponse, AppFailure>>
  /** Yields text deltas, then one `done`. Failures are thrown as [AiStreamError]. */
  stream?(req: AiRequest): AsyncGenerator<StreamEvent, void, void>
  listModels(): Promise<Result<string[], AppFailure>>
}

export class AiStreamError extends Error {
  constructor(readonly failure: AppFailure) {
    super(failure.kind)
  }
}

/** HTTP seam; the default goes through the SSRF-guarded client. */
export type AiHttp = {
  request(
    url: string,
    o: {
      method?: string
      headers: Record<string, string>
      body?: string
      signal?: AbortSignal
      timeoutMs?: number
    },
  ): Promise<{ status: number; headers: Headers; text: string }>
  stream(
    url: string,
    o: { headers: Record<string, string>; body: string; signal?: AbortSignal },
  ): Promise<{
    status: number
    headers: Headers
    body: AsyncIterable<Uint8Array>
    text(): Promise<string>
    close(): void
  }>
}
