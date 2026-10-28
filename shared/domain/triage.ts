import { z } from 'zod'

export const category = z.enum([
  'direct_personal',
  'work_request',
  'meeting_calendar',
  'finance_billing',
  'notification_automated',
  'newsletter_marketing',
  'social',
  'security_account',
  'other',
])
export const importance = z.enum(['high', 'medium', 'low'])
export const urgency = z.enum(['urgent', 'not_urgent'])
export const priority = z.enum(['p1_do_now', 'p2_today', 'p3_this_week', 'p4_fyi'])
export const triageSource = z.enum(['ai', 'rule', 'user'])

export type Category = z.infer<typeof category>
export type Importance = z.infer<typeof importance>
export type Urgency = z.infer<typeof urgency>
export type Priority = z.infer<typeof priority>

/** Importance x urgency to priority (same matrix as the mobile app). */
export function priorityOf(i: Importance, u: Urgency): Priority {
  if (i === 'high') return u === 'urgent' ? 'p1_do_now' : 'p2_today'
  if (i === 'medium') return u === 'urgent' ? 'p2_today' : 'p3_this_week'
  return u === 'urgent' ? 'p3_this_week' : 'p4_fyi'
}

export const actionStatus = z.enum(['open', 'done', 'snoozed'])
export const actionItem = z.object({
  id: z.string(),
  messageId: z.string(),
  text: z.string(),
  dueAt: z.coerce.date().nullable().default(null),
  dueText: z.string().nullable().default(null),
  status: actionStatus.default('open'),
})
export type ActionItem = z.infer<typeof actionItem>

export const triageResult = z.object({
  messageId: z.string(),
  category,
  importance,
  urgency,
  priority,
  needsReply: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).nullable().default(null),
  source: triageSource,
})
export type TriageResult = z.infer<typeof triageResult>

export const senderRuleKind = z.enum(['vip', 'mute', 'correction'])
export type SenderRuleKind = z.infer<typeof senderRuleKind>
