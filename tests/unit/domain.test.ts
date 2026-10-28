import { describe, expect, it } from 'vitest'
import { err, ok, map, unwrap } from '../../shared/errors/result'
import { failureKinds, httpStatusFor, toWire, type AppFailure } from '../../shared/errors/failure'
import { priorityOf, mailMessage, imapSettings, dailyBrief } from '../../shared/domain'

describe('Result', () => {
  it('maps and unwraps', () => {
    expect(unwrap(map(ok(2), (x) => x * 2))).toBe(4)
    expect(map(err('e'), (x: number) => x).ok).toBe(false)
    expect(() => unwrap(err({ kind: 'unknown' }))).toThrow()
  })
})

describe('failures', () => {
  const samples: AppFailure[] = [
    { kind: 'network' },
    { kind: 'auth', problem: 'needs_reauth' },
    { kind: 'provider', status: 500, code: 'x' },
    { kind: 'ai_output', problem: 'truncated' },
    { kind: 'consent_required', providerId: 'p' },
    { kind: 'cap_reached', scope: 'tokens' },
    { kind: 'rate_limited' },
    { kind: 'storage', code: 'x' },
    { kind: 'validation', code: 'x' },
    { kind: 'forbidden' },
    { kind: 'not_found' },
    { kind: 'send_refused', reason: 'expired' },
    { kind: 'unknown' },
  ]
  it('covers every kind with a status and a wire form', () => {
    expect(samples.map((s) => s.kind).sort()).toEqual([...failureKinds].sort())
    for (const s of samples) {
      expect(httpStatusFor(s)).toBeGreaterThanOrEqual(400)
      expect(toWire(s).kind).toBe(s.kind)
    }
  })
  it('wire form carries no free text', () => {
    expect(
      JSON.stringify(toWire({ kind: 'provider', status: 429, code: 'rate_limit' })),
    ).not.toMatch(/message/)
  })
})

describe('domain schemas', () => {
  it('priority matrix', () => {
    expect(priorityOf('high', 'urgent')).toBe('p1_do_now')
    expect(priorityOf('high', 'not_urgent')).toBe('p2_today')
    expect(priorityOf('medium', 'urgent')).toBe('p2_today')
    expect(priorityOf('medium', 'not_urgent')).toBe('p3_this_week')
    expect(priorityOf('low', 'urgent')).toBe('p3_this_week')
    expect(priorityOf('low', 'not_urgent')).toBe('p4_fyi')
  })
  it('message round trip with date coercion and defaults', () => {
    const m = mailMessage.parse({
      providerMessageId: 'p',
      providerThreadId: null,
      internetMessageId: '<a@b>',
      from: { address: 'a@b.test' },
      to: [{ address: 'c@d.test', name: 'C' }],
      subject: 's',
      sentAt: '2026-10-27T09:00:00Z',
      receivedAt: '2026-10-27T09:00:00Z',
      isRead: false,
    })
    expect(m.sentAt).toBeInstanceOf(Date)
    expect(m.cc).toEqual([])
    expect(mailMessage.parse(JSON.parse(JSON.stringify(m))).subject).toBe('s')
  })
  it('rejects bad input', () => {
    expect(() => imapSettings.parse({ imapHost: '', imapPort: 99999 })).toThrow()
    expect(() => dailyBrief.parse({})).toThrow()
  })
})
