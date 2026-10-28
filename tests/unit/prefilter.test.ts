import { describe, expect, it } from 'vitest'
import { preFilter, ruleMatches, type SenderRule } from '../../server/triage/prefilter'
import { priorityOf } from '../../shared/domain'

const msg = (
  o: {
    from?: string
    subject?: string
    listUnsubscribe?: string | null
    precedence?: string | null
    autoSubmitted?: string | null
  } = {},
) => ({
  from: { address: o.from ?? 'alex@acme.example' },
  subject: o.subject ?? 'Q3 numbers',
  listUnsubscribe: o.listUnsubscribe ?? null,
  precedence: o.precedence ?? null,
  autoSubmitted: o.autoSubmitted ?? null,
})
const decide = (
  m: ReturnType<typeof msg>,
  o: { rules?: SenderRule[]; excluded?: boolean; optIn?: boolean } = {},
) =>
  preFilter(m, { rules: o.rules ?? [], accountAiExcluded: o.excluded, aiForNewsletters: o.optIn })
const rule = (pattern: string, kind: SenderRule['kind']): SenderRule => ({ pattern, kind })

describe('pre-filter (parity with the mobile app)', () => {
  it('a normal personal email goes to AI', () =>
    expect(decide(msg())).toEqual({ action: 'send_to_ai', vip: false }))

  it('List-Unsubscribe marks newsletters', () => {
    expect(decide(msg({ listUnsubscribe: '<mailto:u@x.example>' }))).toMatchObject({
      action: 'labeled',
      category: 'newsletter_marketing',
      importance: 'low',
    })
  })
  it.each(['bulk', 'List', 'JUNK'])('Precedence %s is bulk', (p) =>
    expect(decide(msg({ precedence: p })).action).toBe('labeled'),
  )
  it('other precedence values are ordinary mail', () =>
    expect(decide(msg({ precedence: 'first-class' })).action).toBe('send_to_ai'))
  it('Auto-Submitted other than "no" is automated', () => {
    expect(decide(msg({ autoSubmitted: 'auto-generated' }))).toMatchObject({
      category: 'notification_automated',
    })
    expect(decide(msg({ autoSubmitted: 'no' })).action).toBe('send_to_ai')
  })
  it.each([
    'noreply@shop.example',
    'no-reply@shop.example',
    'do-not-reply@shop.example',
    'donotreply@shop.example',
    'mailer-daemon@mail.example',
    'notifications@github.example',
    'alerts+prod@mon.example',
  ])('no-reply style sender %s', (from) => expect(decide(msg({ from })).action).toBe('labeled'))
  it.each(['noah@acme.example', 'systemic.risk@uni.example'])(
    'people with similar names are not automated: %s',
    (from) => expect(decide(msg({ from })).action).toBe('send_to_ai'),
  )
  it('opt-in sends bulk and automated mail to AI anyway', () => {
    expect(decide(msg({ precedence: 'bulk' }), { optIn: true }).action).toBe('send_to_ai')
    expect(decide(msg({ from: 'noreply@x.example' }), { optIn: true }).action).toBe('send_to_ai')
  })
})

describe('security mail never goes to AI', () => {
  it.each([
    'Your verification code is 123456',
    'Password reset request',
    'Reset your password',
    'Security alert: new sign-in from Chrome',
    'New login detected',
    'Your one-time passcode',
    'Confirm your email address',
    'Two-factor authentication enabled',
    'Verify your account',
    'Suspicious activity on your account',
    'Your code is 4821',
  ])('%s', (subject) =>
    expect(decide(msg({ subject }))).toMatchObject({
      action: 'labeled',
      category: 'security_account',
    }),
  )
  it('wins over VIP and over the newsletter opt-in', () => {
    expect(
      decide(msg({ subject: 'Password reset' }), { rules: [rule('alex@acme.example', 'vip')] })
        .action,
    ).toBe('labeled')
    expect(
      decide(msg({ subject: 'Password reset', precedence: 'bulk' }), { optIn: true }).action,
    ).toBe('labeled')
  })
  it('ordinary subjects with similar words are not security mail', () => {
    expect(decide(msg({ subject: 'Notes on the new login page design' })).action).toBe('send_to_ai')
    expect(decide(msg({ subject: 'Lunch code of conduct' })).action).toBe('send_to_ai')
  })
})

describe('rules', () => {
  it('muted senders are labeled Low (address and domain, case-insensitive)', () => {
    for (const r of [rule('Alex@Acme.example', 'mute'), rule('@acme.example', 'mute')])
      expect(decide(msg(), { rules: [r] })).toMatchObject({
        action: 'labeled',
        importance: 'low',
        reason: 'Muted sender',
      })
    expect(
      decide(msg({ from: 'x@other.example' }), { rules: [rule('@acme.example', 'mute')] }).action,
    ).toBe('send_to_ai')
  })
  it('a domain rule does not match look-alike domains', () => {
    expect(
      decide(msg({ from: 'a@notacme.example' }), { rules: [rule('@acme.example', 'mute')] }).action,
    ).toBe('send_to_ai')
    expect(ruleMatches(rule('@acme.example', 'mute'), 'a@sub.acme.example')).toBe(false)
  })
  it('mute beats VIP; VIP goes to AI even when it looks bulk', () => {
    expect(
      decide(msg(), { rules: [rule('alex@acme.example', 'vip'), rule('@acme.example', 'mute')] })
        .action,
    ).toBe('labeled')
    expect(
      decide(msg({ from: 'noreply@board.example', precedence: 'bulk' }), {
        rules: [rule('noreply@board.example', 'vip')],
      }),
    ).toEqual({ action: 'send_to_ai', vip: true })
  })
  it('correction rules do not change pre-filtering', () =>
    expect(decide(msg(), { rules: [rule('alex@acme.example', 'correction')] }).action).toBe(
      'send_to_ai',
    ))
  it('AI-excluded accounts are never sent to AI, whatever the content', () => {
    expect(decide(msg(), { excluded: true })).toEqual({ action: 'excluded' })
    expect(decide(msg({ subject: 'Password reset' }), { excluded: true })).toEqual({
      action: 'excluded',
    })
  })
})

describe('priority matrix (BR-05)', () => {
  it.each([
    ['high', 'urgent', 'p1_do_now'],
    ['high', 'not_urgent', 'p2_today'],
    ['medium', 'urgent', 'p2_today'],
    ['medium', 'not_urgent', 'p3_this_week'],
    ['low', 'urgent', 'p3_this_week'],
    ['low', 'not_urgent', 'p4_fyi'],
  ] as const)('%s + %s → %s', (i, u, p) => expect(priorityOf(i, u)).toBe(p))
})
