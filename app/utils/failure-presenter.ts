import type { AppFailure } from '#shared/errors/failure'

/** What the user can do next; the UI renders a button (or none) for it. */
export type RecoveryAction =
  | 'retry'
  | 'reconnect'
  | 'open_accounts'
  | 'open_ai_settings'
  | 'fix_input'
  | 'wait'
  | 'sign_in'
  | 'step_up'
  | 'admin_help'
  | 'none'

export type Presented = {
  /** i18n key under `failure.` */
  messageKey: string
  /** Only plain numbers and a field name; never text from providers or mail. */
  params: { seconds?: number; field?: string }
  action: RecoveryAction
  severity: 'info' | 'warning' | 'error'
}

/** Wire form `{kind, detail}` as returned by the API (see toWire). */
export type WireFailure = { kind: AppFailure['kind']; detail?: Record<string, unknown> }

const p = (
  messageKey: string,
  action: RecoveryAction,
  severity: Presented['severity'] = 'error',
  params: Presented['params'] = {},
): Presented => ({ messageKey: `failure.${messageKey}`, action, severity, params })

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.ceil(v) : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Turns any failure into a localized message key and a recovery action. */
export function presentFailure(f: WireFailure): Presented {
  const d = f.detail ?? {}
  switch (f.kind) {
    case 'network':
      return p('network', 'retry', 'warning')
    case 'auth':
      switch (str(d.problem)) {
        case 'needs_reauth':
          return p('auth.needs_reauth', 'reconnect')
        case 'invalid_credentials':
          return p('auth.invalid_credentials', 'fix_input')
        case 'admin_consent_required':
          return p('auth.admin_consent_required', 'admin_help')
        case 'consent_required':
          return p('auth.consent_required', 'reconnect')
        default:
          return p('auth.generic', 'sign_in')
      }
    case 'provider': {
      const status = num(d.status)
      if (status === 410) return p('provider.resync', 'retry', 'info')
      if (status !== undefined && status >= 500)
        return p('provider.unavailable', 'retry', 'warning')
      return p('provider.generic', 'retry')
    }
    case 'ai_output':
      switch (str(d.problem)) {
        case 'refusal':
          return p('ai.refusal', 'none', 'info')
        case 'truncated':
          return p('ai.truncated', 'retry', 'warning')
        case 'empty':
          return p('ai.empty', 'retry', 'warning')
        default:
          return p('ai.invalid', 'retry', 'warning')
      }
    case 'consent_required':
      return p('ai_consent', 'open_ai_settings', 'warning')
    case 'cap_reached':
      return p(str(d.scope) === 'cost' ? 'cap.cost' : 'cap.tokens', 'open_ai_settings', 'warning')
    case 'rate_limited':
      return p('rate_limited', 'wait', 'warning', { seconds: num(d.retryAfterSeconds) })
    case 'storage':
      return p('storage', 'retry')
    case 'validation': {
      const field = str(d.field)
      const code = str(d.code)
      const known = [
        'limit_reached',
        'already_connected',
        'private_address',
        'tls_failed',
        'unknown_folder',
      ]
      return p(
        known.includes(code) ? `validation.${code}` : 'validation.generic',
        'fix_input',
        'warning',
        field ? { field } : {},
      )
    }
    case 'forbidden':
      return p('forbidden', 'none')
    case 'not_found':
      return p('not_found', 'none', 'warning')
    case 'send_refused': {
      const reason = str(d.reason)
      const keys = [
        'not_confirmed',
        'expired',
        'already_used',
        'revoked',
        'content_changed',
        'no_recipients',
        'empty_body',
        'placeholders',
        'daily_limit',
        'step_up_required',
      ]
      return p(
        keys.includes(reason) ? `send.${reason}` : 'send.unknown',
        reason === 'step_up_required' ? 'step_up' : reason === 'daily_limit' ? 'none' : 'fix_input',
      )
    }
    default:
      return p('unknown', 'retry')
  }
}

/** Every key the presenter can return; tests check each exists in the locale files. */
export const FAILURE_KEYS = [
  'network',
  'auth.needs_reauth',
  'auth.invalid_credentials',
  'auth.admin_consent_required',
  'auth.consent_required',
  'auth.generic',
  'provider.resync',
  'provider.unavailable',
  'provider.generic',
  'ai.refusal',
  'ai.truncated',
  'ai.empty',
  'ai.invalid',
  'ai_consent',
  'cap.cost',
  'cap.tokens',
  'rate_limited',
  'storage',
  'validation.limit_reached',
  'validation.already_connected',
  'validation.private_address',
  'validation.tls_failed',
  'validation.unknown_folder',
  'validation.generic',
  'forbidden',
  'not_found',
  'send.not_confirmed',
  'send.expired',
  'send.already_used',
  'send.revoked',
  'send.content_changed',
  'send.no_recipients',
  'send.empty_body',
  'send.placeholders',
  'send.daily_limit',
  'send.step_up_required',
  'send.unknown',
  'unknown',
] as const
