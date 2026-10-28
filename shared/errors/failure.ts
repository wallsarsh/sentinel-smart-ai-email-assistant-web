/** Why an operation failed. Never carries mail content, addresses or secrets. */
export type AuthProblem =
  'needs_reauth' | 'invalid_credentials' | 'consent_required' | 'admin_consent_required'
export type AiOutputProblem = 'schema_invalid' | 'refusal' | 'truncated' | 'unknown_ids' | 'empty'

export type AppFailure =
  | { kind: 'network'; code?: string }
  | { kind: 'auth'; problem: AuthProblem; code?: string }
  | { kind: 'provider'; status: number | null; code: string }
  | { kind: 'ai_output'; problem: AiOutputProblem }
  | { kind: 'consent_required'; providerId: string }
  | { kind: 'cap_reached'; scope: 'tokens' | 'cost' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'storage'; code: string }
  | { kind: 'validation'; field?: string; code: string }
  | { kind: 'forbidden'; code?: string }
  | { kind: 'not_found' }
  | { kind: 'send_refused'; reason: SendRefusal }
  | { kind: 'unknown' }

export type SendRefusal =
  | 'not_confirmed'
  | 'expired'
  | 'already_used'
  | 'revoked'
  | 'content_changed'
  | 'no_recipients'
  | 'empty_body'
  | 'placeholders'
  | 'daily_limit'
  | 'step_up_required'
  | 'unknown_authorization'

export const failureKinds = [
  'network',
  'auth',
  'provider',
  'ai_output',
  'consent_required',
  'cap_reached',
  'rate_limited',
  'storage',
  'validation',
  'forbidden',
  'not_found',
  'send_refused',
  'unknown',
] as const satisfies readonly AppFailure['kind'][]

/** HTTP status for a failure (API layer). */
export function httpStatusFor(f: AppFailure): number {
  switch (f.kind) {
    case 'auth':
      return 401
    case 'forbidden':
    case 'send_refused':
      return 403
    case 'not_found':
      return 404
    case 'validation':
      return 422
    case 'rate_limited':
    case 'cap_reached':
      return 429
    case 'consent_required':
      return 409
    case 'network':
    case 'provider':
      return 502
    default:
      return 500
  }
}

/** Wire format of an error response: kind and code only, no text from providers. */
export function toWire(f: AppFailure): {
  kind: AppFailure['kind']
  detail: Record<string, unknown>
} {
  const { kind, ...detail } = f
  return { kind, detail }
}
