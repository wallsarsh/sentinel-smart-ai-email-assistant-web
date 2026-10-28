import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  actionStatusEnum,
  briefSectionEnum,
  categoryEnum,
  createdAt,
  draftStatusEnum,
  id,
  importanceEnum,
  priorityEnum,
  sendStatusEnum,
  senderRuleKindEnum,
  triageSourceEnum,
  urgencyEnum,
  userId,
} from './columns'
import { accounts, messages } from './mail'

export const triageResults = pgTable(
  'triage_results',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: userId(),
    category: categoryEnum('category').notNull(),
    importance: importanceEnum('importance').notNull(),
    urgency: urgencyEnum('urgency').notNull(),
    priority: priorityEnum('priority').notNull(),
    needsReply: boolean('needs_reply').notNull(),
    summary: text('summary').notNull(),
    reason: text('reason').notNull(),
    confidence: doublePrecision('confidence'),
    source: triageSourceEnum('source').notNull(),
    providerId: text('provider_id'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    createdAt: createdAt(),
  },
  (t) => [index('triage_user_priority').on(t.userId, t.priority)],
)

export const actionItems = pgTable(
  'action_items',
  {
    id: id(),
    userId: userId(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    itemText: text('item_text').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dueText: text('due_text'),
    status: actionStatusEnum('status').notNull().default('open'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('actions_user_status_due').on(t.userId, t.status, t.dueAt)],
)

export const senderRules = pgTable(
  'sender_rules',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    rule: senderRuleKindEnum('rule').notNull(),
    payloadJson: jsonb('payload_json').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('sender_rules_user').on(t.userId)],
)

export const draftRefs = pgTable(
  'draft_refs',
  {
    id: id(),
    userId: userId(),
    messageId: uuid('message_id').notNull(), // no FK: drafts outlive message retention
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    providerDraftId: text('provider_draft_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    tone: text('tone').notNull(),
    intent: text('intent').notNull(),
    status: draftStatusEnum('status').notNull().default('local'),
    bodyPreview: text('body_preview').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('draft_refs_key').on(t.userId, t.idempotencyKey)],
)

/** Metadata only: never the body (WEB §2). */
export const sendRecords = pgTable(
  'send_records',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    draftRefId: uuid('draft_ref_id'),
    internetMessageId: text('internet_message_id').notNull(),
    contentHash: text('content_hash').notNull(),
    recipientCount: integer('recipient_count').notNull(),
    status: sendStatusEnum('status').notNull().default('pending'),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    errorCode: text('error_code'),
  },
  (t) => [index('send_records_user_approved').on(t.userId, t.approvedAt)],
)

export const dailyBriefs = pgTable(
  'daily_briefs',
  {
    id: id(),
    userId: userId(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    headline: text('headline').notNull(),
    statsJson: jsonb('stats_json').notNull().default({}),
    providerId: text('provider_id'),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [index('briefs_user_created').on(t.userId, t.createdAt)],
)

export const briefItems = pgTable('brief_items', {
  id: id(),
  userId: userId(),
  briefId: uuid('brief_id')
    .notNull()
    .references(() => dailyBriefs.id, { onDelete: 'cascade' }),
  section: briefSectionEnum('section').notNull(),
  itemText: text('item_text').notNull(),
  messageIdsJson: jsonb('message_ids_json').notNull().default([]),
  position: integer('position').notNull(),
})
