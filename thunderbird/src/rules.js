// Sender rules and cheap pre-filtering. Pure functions; no browser APIs.
import { priorityOf } from '../../packages/core/src/brief'

export const RULE_KINDS = ['important', 'marketing', 'ignore', 'normal']
export const RULE_RANK = { normal: 0, marketing: 1, important: 2, ignore: 3 }
export const RULE_LABEL = {
  important: 'Important',
  marketing: 'Marketing / bulk',
  ignore: 'Ignore',
  normal: 'Normal',
}

const idFor = () =>
  globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Accepts "Alex <alex@acme.example>", "alex@acme.example", "@acme.example", "@*.acme.example" or "acme.example". */
export function normalizePattern(raw) {
  let s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!s) throw new Error('Enter an email address or domain.')
  const m = /<([^>\s]+)>$/.exec(s)
  if (m) s = m[1]
  if (s.startsWith('*@')) s = `@${s.slice(2)}`
  if (s.startsWith('@*.')) {
    const domain = s.slice(3)
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
      throw new Error('Enter a domain such as @*.example.com.')
    return `@*.${domain}`
  }
  if (s.startsWith('@')) {
    const domain = s.slice(1)
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
      throw new Error('Enter a domain such as @example.com.')
    return `@${domain}`
  }
  if (s.startsWith('*.')) s = s.slice(2)
  if (s.includes('@')) {
    if (!/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s))
      throw new Error('Enter a valid email address.')
    return s
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s))
    throw new Error('Enter an email address or a domain such as example.com.')
  return `@${s}`
}

/** Validates kind and pattern, preserves an existing id, and produces a stable id when none is given. */
export function normalizeRule(raw = {}) {
  const kind = RULE_KINDS.includes(raw.kind) ? raw.kind : 'normal'
  const pattern = normalizePattern(raw.pattern)
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : idFor(),
    pattern,
    kind,
    label: typeof raw.label === 'string' ? raw.label.trim() : '',
  }
}

export const addressOf = (sender) => {
  const s = String(sender ?? '').trim().toLowerCase()
  const m = /<([^>\s]+)>$/.exec(s)
  return m ? m[1] : s
}

const domainOf = (address) => address.slice(address.lastIndexOf('@') + 1)

/** Specificity: exact address 3, subdomain 2, domain 1. */
function specificity(pattern, address) {
  if (pattern.startsWith('@*.')) {
    const d = pattern.slice(3)
    return address.endsWith(`.${d}`) ? 2 : 0
  }
  if (pattern.startsWith('@')) {
    const d = pattern.slice(1)
    return domainOf(address) === d ? 1 : 0
  }
  return address === pattern ? 3 : 0
}

/**
 * Best rule for a sender. Exact addresses beat subdomains, which beat domains.
 * On equal specificity ignore > important > marketing > normal, then the later rule wins.
 */
export function matchRule(sender, rules = []) {
  const address = addressOf(sender)
  if (!address.includes('@')) return null
  let best = null
  let bestSpec = 0
  let bestRank = -1
  for (const rule of rules) {
    const spec = specificity(rule.pattern, address)
    if (!spec) continue
    const rank = RULE_RANK[rule.kind] ?? 0
    if (spec > bestSpec || (spec === bestSpec && rank >= bestRank)) {
      best = rule
      bestSpec = spec
      bestRank = rank
    }
  }
  return best
}

export const senderRuleKind = (sender, rules = []) => matchRule(sender, rules)?.kind ?? 'normal'

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const clip = (s, n) => {
  const t = clean(s)
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

export function isBulkMessage(message) {
  if (message?.listUnsubscribe) return true
  const precedence = String(message?.precedence ?? '').toLowerCase()
  if (['bulk', 'list', 'junk'].includes(precedence)) return true
  const auto = String(message?.autoSubmitted ?? '').toLowerCase()
  return Boolean(auto && auto !== 'no')
}

const NO_REPLY = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster)@/
export const isNoReplySender = (sender) => NO_REPLY.test(addressOf(sender))

const SECURITY =
  /(password reset|reset your password|verify your (account|email|identity)|verification code|one[- ]time (code|password)|otp\b|login (attempt|alert)|security alert|suspicious (sign|login)|two[- ]factor|2fa\b|account (locked|suspended))/i

/** Heuristic: never send these bodies to a model. The subject and a short body sniff are local only. */
export function looksSecurity(message) {
  const subject = String(message?.subject ?? '')
  const body = String(message?.bodyText ?? message?.bodyHtml ?? '').slice(0, 1200)
  return SECURITY.test(subject) || SECURITY.test(body)
}

const base = (message, now) => ({
  category: 'other',
  importance: 'low',
  urgency: 'notUrgent',
  needsReply: false,
  summary: clip(message?.subject || 'No subject', 160),
  reason: '',
  actionItems: [],
  calendarEvents: [],
  confidence: 1,
  intent: 'other',
  replyIntent: 'acknowledge',
  by: 'rule',
  at: now.getTime(),
  skipped: true,
})

/** Local classifications used when a message must not reach the model. */
export function localAnalysis(message, kind, now = new Date()) {
  const a = base(message, now)
  if (kind === 'ignore') {
    return {
      ...a,
      summary: 'Ignored by a sender rule.',
      reason: 'This sender is on your ignore list, so no AI call was made.',
      intent: 'other',
    }
  }
  if (kind === 'security') {
    return {
      ...a,
      category: 'securityAccount',
      importance: 'high',
      urgency: 'urgent',
      summary: clip(message?.subject || 'Security-related message', 160),
      reason: 'Security mail is classified locally; its body is not sent to the AI.',
      intent: 'security',
    }
  }
  if (kind === 'notification') {
    return {
      ...a,
      category: 'notificationAutomated',
      summary: clip(message?.subject || 'Automated notification', 160),
      reason: 'Automated sender; no reply is expected.',
      intent: 'notification',
    }
  }
  return {
    ...a,
    category: 'newsletterMarketing',
    summary: clip(message?.subject || 'Marketing message', 160),
    reason: 'Bulk or list mail was filtered locally to save tokens.',
    intent: 'marketing',
  }
}

/**
 * Decides the path for one message before any AI call.
 * Returns {action:'analyze'|'local', rule, boostImportance, analysis?}.
 */
export function preFilter(message, rules = [], settings = {}, now = new Date()) {
  const rule = matchRule(message?.from?.address ?? message?.from, rules)
  if (rule?.kind === 'ignore')
    return { action: 'local', rule, analysis: localAnalysis(message, 'ignore', now) }
  if (rule?.kind === 'important') return { action: 'analyze', rule, boostImportance: true }
  if (rule?.kind === 'marketing' && !settings?.monitor?.analyzeMarketing)
    return { action: 'local', rule, analysis: localAnalysis(message, 'marketing', now) }

  if (looksSecurity(message))
    return { action: 'local', rule, analysis: localAnalysis(message, 'security', now) }
  if (isBulkMessage(message))
    return settings?.monitor?.analyzeMarketing
      ? { action: 'analyze', rule, boostImportance: false }
      : { action: 'local', rule, analysis: localAnalysis(message, 'marketing', now) }
  if (isNoReplySender(message?.from?.address ?? message?.from))
    return { action: 'local', rule, analysis: localAnalysis(message, 'notification', now) }
  return { action: 'analyze', rule, boostImportance: rule?.kind === 'important' }
}

/** Applies deterministic business rules after the model: VIP importance and a stable priority. */
export function applyAnalysisPolicy(analysis, { rule = null, boostImportance = false } = {}) {
  const importance = boostImportance ? 'high' : analysis.importance
  const urgency = analysis.urgency === 'urgent' ? 'urgent' : 'notUrgent'
  return {
    ...analysis,
    importance,
    urgency,
    priority: priorityOf(importance, urgency),
    ruleKind: rule?.kind ?? 'normal',
  }
}

/** Turns an analysis into the row shape the brief/cache uses. */
export function withSender(analysis, header, now = Date.now()) {
  return {
    ...analysis,
    sender: header?.author ?? '',
    subject: header?.subject ?? '',
    messageId: header?.id ?? null,
    headerMessageId: header?.headerMessageId ?? null,
    date: header?.date ?? null,
    at: now,
    by: analysis.by ?? 'ai',
  }
}
