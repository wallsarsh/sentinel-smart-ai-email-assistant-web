import { pgEnum, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const id = () => uuid('id').primaryKey().defaultRandom()
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
/** Every tenant table carries this; deleting the user deletes the rows. */
export const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

export const accountTypeEnum = pgEnum('account_type', ['gmail', 'microsoft_graph', 'imap'])
export const accountStatusEnum = pgEnum('account_status', ['active', 'needs_reauth', 'disabled'])
export const folderRoleEnum = pgEnum('folder_role', [
  'inbox',
  'sent',
  'drafts',
  'trash',
  'spam',
  'archive',
  'other',
])
export const importanceEnum = pgEnum('importance', ['high', 'medium', 'low'])
export const urgencyEnum = pgEnum('urgency', ['urgent', 'not_urgent'])
export const priorityEnum = pgEnum('priority', ['p1_do_now', 'p2_today', 'p3_this_week', 'p4_fyi'])
export const categoryEnum = pgEnum('category', [
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
export const triageSourceEnum = pgEnum('triage_source', ['ai', 'rule', 'user'])
export const actionStatusEnum = pgEnum('action_status', ['open', 'done', 'snoozed'])
export const senderRuleKindEnum = pgEnum('sender_rule_kind', ['vip', 'mute', 'correction'])
export const draftStatusEnum = pgEnum('draft_status', ['local', 'saved', 'deleted'])
export const sendStatusEnum = pgEnum('send_status', [
  'pending',
  'submitting',
  'sent',
  'failed',
  'unknown',
  'cancelled',
])
export const briefSectionEnum = pgEnum('brief_section', [
  'top_priorities',
  'needs_reply',
  'due_today',
  'fyi',
])
export const aiKindEnum = pgEnum('ai_kind', ['anthropic', 'openai', 'openai_compatible'])
export const aiTaskEnum = pgEnum('ai_task', ['triage', 'brief', 'draft', 'repair', 'default'])
export const tlsEnum = pgEnum('tls_mode', ['implicit_tls', 'start_tls'])

export const jsonText = (name: string) => text(name).notNull().default('{}')
