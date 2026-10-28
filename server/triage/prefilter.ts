import type { MailMessage, Category, Importance, Urgency } from '../../shared/domain'

export type SenderRuleKind = 'vip' | 'mute' | 'correction'

/** A VIP/mute rule. [pattern] is an address or `@domain`. */
export type SenderRule = { pattern: string; kind: SenderRuleKind }

export const ruleMatches = (r: SenderRule, address: string) => {
  const a = address.trim().toLowerCase()
  const p = r.pattern.trim().toLowerCase()
  return p.startsWith('@') ? a.endsWith(p) : a === p
}

export type PreFilterDecision =
  /** The message needs the AI. `vip` means importance must be at least High. */
  | { action: 'send_to_ai'; vip: boolean }
  /** A rule produced the label; the body is not sent to AI. */
  | {
      action: 'labeled'
      category: Category
      importance: Importance
      urgency: Urgency
      reason: string
    }
  /** Nothing is stored or sent: the account is excluded from AI. */
  | { action: 'excluded' }

const NO_REPLY =
  /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|notify|alerts?|automated|system)(?:[+._-].*)?$/i

const SECURITY = new RegExp(
  [
    'verification code',
    'security code',
    'one[- ]time (?:code|password|passcode)',
    '\\botp\\b',
    'password reset',
    'reset your password',
    'forgot your password',
    'security alert',
    'suspicious (?:sign[- ]?in|activity|login)',
    'new (?:sign[- ]?in|login) (?:to|from|detected)',
    'sign[- ]?in attempt',
    'two[- ]factor',
    '2[- ]?step',
    '\\b2fa\\b',
    'confirm your (?:e-?mail|account)',
    'verify your (?:e-?mail|account|identity)',
    'login code',
    'your code is',
    'account (?:recovery|locked|suspended)',
  ].join('|'),
  'i',
)

const label = (category: Category, reason: string): PreFilterDecision => ({
  action: 'labeled',
  category,
  importance: 'low',
  urgency: 'not_urgent',
  reason,
})

/**
 * Deterministic, cheap rules applied before any AI call. Precedence: excluded
 * account, muted sender, security mail, VIP (always goes to AI), bulk,
 * automated, everything else. [aiForNewsletters] sends bulk mail to AI anyway
 * (user opt-in).
 */
export function preFilter(
  m: Pick<MailMessage, 'from' | 'subject' | 'listUnsubscribe' | 'precedence' | 'autoSubmitted'>,
  o: { rules: SenderRule[]; accountAiExcluded?: boolean; aiForNewsletters?: boolean },
): PreFilterDecision {
  if (o.accountAiExcluded) return { action: 'excluded' }
  const sender = m.from.address
  const has = (k: SenderRuleKind) => o.rules.some((r) => r.kind === k && ruleMatches(r, sender))

  if (has('mute')) return label('other', 'Muted sender')
  if (SECURITY.test(m.subject))
    return {
      action: 'labeled',
      category: 'security_account',
      importance: 'medium',
      urgency: 'not_urgent',
      reason: 'Account security message (not sent to AI)',
    }
  if (has('vip')) return { action: 'send_to_ai', vip: true }

  const prec = m.precedence?.trim().toLowerCase()
  if (m.listUnsubscribe?.trim() || prec === 'bulk' || prec === 'list' || prec === 'junk')
    return o.aiForNewsletters
      ? { action: 'send_to_ai', vip: false }
      : label('newsletter_marketing', 'Bulk or marketing mail')

  const auto = m.autoSubmitted?.trim().toLowerCase()
  if ((auto && auto !== 'no') || NO_REPLY.test(sender.split('@')[0] ?? ''))
    return o.aiForNewsletters
      ? { action: 'send_to_ai', vip: false }
      : label('notification_automated', 'Automated notification')

  return { action: 'send_to_ai', vip: false }
}
