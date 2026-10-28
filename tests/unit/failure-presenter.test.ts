import { describe, expect, it } from 'vitest'
import { failureKinds, toWire, type AppFailure } from '../../shared/errors/failure'
import { FAILURE_KEYS, presentFailure } from '../../app/utils/failure-presenter'
import en from '../../i18n/locales/en.json'

const has = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en)

const cases: AppFailure[] = [
  { kind: 'network' },
  { kind: 'network', code: 'ECONNRESET' },
  { kind: 'auth', problem: 'needs_reauth' },
  { kind: 'auth', problem: 'invalid_credentials' },
  { kind: 'auth', problem: 'consent_required' },
  { kind: 'auth', problem: 'admin_consent_required' },
  { kind: 'provider', status: 410, code: 'gone' },
  { kind: 'provider', status: 503, code: 'x' },
  { kind: 'provider', status: 400, code: 'x' },
  { kind: 'provider', status: null, code: 'x' },
  { kind: 'ai_output', problem: 'schema_invalid' },
  { kind: 'ai_output', problem: 'refusal' },
  { kind: 'ai_output', problem: 'truncated' },
  { kind: 'ai_output', problem: 'unknown_ids' },
  { kind: 'ai_output', problem: 'empty' },
  { kind: 'consent_required', providerId: 'anthropic' },
  { kind: 'cap_reached', scope: 'tokens' },
  { kind: 'cap_reached', scope: 'cost' },
  { kind: 'rate_limited', retryAfterSeconds: 12 },
  { kind: 'rate_limited' },
  { kind: 'storage', code: 'x' },
  { kind: 'validation', field: 'email', code: 'invalid' },
  { kind: 'validation', code: 'limit_reached' },
  { kind: 'validation', code: 'tls_failed' },
  { kind: 'forbidden' },
  { kind: 'not_found' },
  { kind: 'unknown' },
  ...(
    [
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
      'unknown_authorization',
    ] as const
  ).map((reason): AppFailure => ({ kind: 'send_refused', reason })),
]

describe('failure presenter', () => {
  it('covers every failure kind', () => {
    for (const k of failureKinds)
      expect(
        cases.some((c) => c.kind === k),
        k,
      ).toBe(true)
  })

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))(
    '%s has a real message and action',
    (_n, c) => {
      const r = presentFailure(toWire(c))
      expect(has(r.messageKey), r.messageKey).toBeTypeOf('string')
      expect(has(`failure.action.${r.action}`), r.action).toBeTypeOf('string')
      expect(FAILURE_KEYS.map((k) => `failure.${k}`)).toContain(r.messageKey)
    },
  )

  it('every declared key exists in the locale', () => {
    for (const k of FAILURE_KEYS) expect(has(`failure.${k}`), k).toBeTypeOf('string')
  })

  it('carries no provider text, codes or content into params', () => {
    const r = presentFailure({
      kind: 'provider',
      detail: { status: 500, code: 'user@secret.test says hi' },
    })
    expect(JSON.stringify(r)).not.toContain('secret')
    const v = presentFailure({
      kind: 'validation',
      detail: { field: 'email', code: 'bob@x.test', problem: 'x' },
    })
    expect(v.params).toEqual({ field: 'email' })
    expect(v.messageKey).toBe('failure.validation.generic')
  })

  it('maps recovery actions sensibly', () => {
    expect(presentFailure(toWire({ kind: 'auth', problem: 'needs_reauth' })).action).toBe(
      'reconnect',
    )
    expect(presentFailure(toWire({ kind: 'rate_limited', retryAfterSeconds: 4.2 }))).toMatchObject({
      action: 'wait',
      params: { seconds: 5 },
    })
    expect(
      presentFailure(toWire({ kind: 'send_refused', reason: 'step_up_required' })).action,
    ).toBe('step_up')
    expect(presentFailure({ kind: 'weird' as never }).messageKey).toBe('failure.unknown')
  })
})
