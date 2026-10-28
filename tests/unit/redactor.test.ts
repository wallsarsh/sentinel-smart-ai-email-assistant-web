import { describe, expect, it } from 'vitest'
import { defaultRedaction, isValidIban, isValidLuhn, redact } from '../../shared/redactor'

describe('luhn and iban', () => {
  it('validate known numbers', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true)
    expect(isValidLuhn('4111111111111112')).toBe(false)
    expect(isValidLuhn('123')).toBe(false)
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true)
    expect(isValidIban('GB82WEST12345698765432')).toBe(true)
    expect(isValidIban('DE89 3704 0044 0532 0130 01')).toBe(false)
  })
})

describe('redact', () => {
  it('cards with spaces or dashes; leaves long non-Luhn numbers (order ids)', () => {
    expect(redact('card 4111 1111 1111 1111 ok')).toContain('[redacted-card]')
    expect(redact('card 4111-1111-1111-1111')).toContain('[redacted-card]')
    expect(redact('order 1234567890123456')).toBe('order 1234567890123456')
  })

  it('IBANs, valid only', () => {
    expect(redact('pay DE89 3704 0044 0532 0130 00 now')).toBe('pay [redacted-iban] now')
    expect(redact('ref DE89 3704 0044 0532 0130 01')).toContain('DE89')
  })

  it('phones: international and spaced numbers, not dates, versions or prices', () => {
    expect(redact('call +49 170 1234567')).toBe('call [redacted-phone]')
    expect(redact('call (030) 123 4567')).toContain('[redacted-phone]')
    expect(redact('call 0170 123 4567')).toContain('[redacted-phone]')
    expect(redact('on 2026-10-28 or 28.10.2026')).toBe('on 2026-10-28 or 28.10.2026')
    expect(redact('version 10.2.3.4567 costs 1234.56')).toBe('version 10.2.3.4567 costs 1234.56')
  })

  it('emails other than the thread participants', () => {
    const t = 'alex@acme.example wrote to bob@x.test and eve@y.test'
    expect(redact(t, defaultRedaction, ['Alex@Acme.example', 'bob@x.test'])).toBe(
      'alex@acme.example wrote to bob@x.test and [redacted-email]',
    )
  })

  it('each kind can be switched off', () => {
    const off = { cards: false, ibans: false, phones: false, otherEmails: false }
    const text = 'a@b.test 4111111111111111 +49 170 1234567 DE89 3704 0044 0532 0130 00'
    expect(redact(text, off)).toBe(text)
    expect(redact(text, { ...off, phones: true })).toContain('[redacted-phone]')
    expect(redact(text, { ...off, phones: true })).toContain('a@b.test')
  })
})
