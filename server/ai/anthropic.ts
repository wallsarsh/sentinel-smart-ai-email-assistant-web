import { anthropicProvider as coreAnthropicProvider } from '../../packages/core/src/ai/anthropic'
import { guardedHttp } from './http'

export * from '../../packages/core/src/ai/anthropic'

/** The server always talks to providers through the SSRF-guarded transport unless a test injects one. */
export const anthropicProvider: typeof coreAnthropicProvider = (o) =>
  coreAnthropicProvider({ ...o, http: o.http ?? guardedHttp() })
