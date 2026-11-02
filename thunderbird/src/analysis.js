// Normalises model output into the shape used by the UI, cache and brief.
import { priorityOf } from '../../packages/core/src/brief'

export const INTENTS = [
  'request',
  'question',
  'meeting',
  'approval',
  'payment',
  'informational',
  'marketing',
  'notification',
  'social',
  'security',
  'other',
]
export const REPLY_INTENTS = ['accept', 'decline', 'ask_for_info', 'acknowledge', 'custom']
export const CATEGORIES = [
  'directPersonal',
  'workRequest',
  'meetingCalendar',
  'financeBilling',
  'notificationAutomated',
  'newsletterMarketing',
  'social',
  'securityAccount',
  'other',
]

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)

/** Fallback when a provider omits or corrupts the intent field. */
export function intentFromCategory(category, needsReply, actionItems = []) {
  if (category === 'newsletterMarketing') return 'marketing'
  if (category === 'notificationAutomated') return 'notification'
  if (category === 'social') return 'social'
  if (category === 'securityAccount') return 'security'
  if (category === 'meetingCalendar') return 'meeting'
  if (category === 'financeBilling') return 'payment'
  if (category === 'workRequest' || category === 'directPersonal')
    return needsReply || actionItems.length ? 'request' : 'informational'
  return needsReply || actionItems.length ? 'request' : 'informational'
}

export function normalizeActionItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .slice(0, 10)
    .map((a) => ({
      text: clip(a?.text, 160),
      dueDate: typeof a?.dueDate === 'string' && a.dueDate.trim() ? a.dueDate.trim() : null,
      dueText: typeof a?.dueText === 'string' && a.dueText.trim() ? clip(a.dueText, 80) : null,
    }))
    .filter((a) => a.text)
}

/**
 * Coerces one result to the stored shape. Priority is always derived here, never trusted from the model.
 * Calendar events are passed through and validated by calendar.js (which also adds due-date actions).
 */
export function normalizeAnalysis(item = {}) {
  const category = oneOf(item.category, CATEGORIES, 'other')
  const importance = oneOf(item.importance, ['high', 'medium', 'low'], 'low')
  const urgency = oneOf(item.urgency, ['urgent', 'notUrgent'], 'notUrgent')
  const actionItems = normalizeActionItems(item.actionItems)
  const needsReply = Boolean(item.needsReply)
  const intent = oneOf(item.intent, INTENTS, intentFromCategory(category, needsReply, actionItems))
  return {
    category,
    importance,
    urgency,
    priority: priorityOf(importance, urgency),
    needsReply,
    summary: clip(item.summary, 220),
    reason: clip(item.reason, 100),
    actionItems,
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
    intent,
    replyIntent: oneOf(item.replyIntent, REPLY_INTENTS, 'acknowledge'),
    replyInstruction: clip(item.replyInstruction, 300),
    calendarEvents: Array.isArray(item.calendarEvents) ? item.calendarEvents.slice(0, 5) : [],
  }
}
