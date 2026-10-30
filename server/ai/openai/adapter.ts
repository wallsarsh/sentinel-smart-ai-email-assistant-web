import { checkUrl, SsrfError, type Resolver } from '../../http/ssrf'
import { err, ok, type Result } from '../../../packages/core/src/errors/result'
import type { AppFailure } from '../../../packages/core/src/errors/failure'
import { openAiProvider as coreOpenAiProvider } from '../../../packages/core/src/ai/openai'
import { guardedHttp } from '../http'

export * from '../../../packages/core/src/ai/openai'

/** The server always talks to providers through the SSRF-guarded transport unless a test injects one. */
export const openAiProvider: typeof coreOpenAiProvider = (o) =>
  coreOpenAiProvider({ ...o, http: o.http ?? guardedHttp() })

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
