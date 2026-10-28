import {
  boolean,
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
  accountStatusEnum,
  accountTypeEnum,
  createdAt,
  folderRoleEnum,
  id,
  tlsEnum,
  userId,
} from './columns'

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: userId(),
    type: accountTypeEnum('type').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull().default(''),
    color: integer('color').notNull().default(0x3f51b5),
    status: accountStatusEnum('status').notNull().default('active'),
    syncCursor: jsonb('sync_cursor'),
    aiExcluded: boolean('ai_excluded').notNull().default(false),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('accounts_user_email').on(t.userId, t.email),
    index('accounts_user').on(t.userId),
  ],
)

export const imapSettings = pgTable('imap_settings', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  userId: userId(),
  imapHost: text('imap_host').notNull(),
  imapPort: integer('imap_port').notNull(),
  imapSecurity: tlsEnum('imap_security').notNull(),
  username: text('username').notNull(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpSecurity: tlsEnum('smtp_security').notNull(),
  smtpUsername: text('smtp_username'),
  draftsFolder: text('drafts_folder'),
  sentFolder: text('sent_folder'),
  serverSavesSent: boolean('server_saves_sent').notNull().default(false),
})

export const folders = pgTable(
  'folders',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    name: text('name').notNull(),
    role: folderRoleEnum('role').notNull().default('other'),
    processed: boolean('processed').notNull().default(false),
  },
  (t) => [uniqueIndex('folders_account_provider').on(t.accountId, t.providerId)],
)

export const threads = pgTable(
  'threads',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject').notNull().default(''),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('threads_account_provider').on(t.accountId, t.providerThreadId)],
)

export const messages = pgTable(
  'messages',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    providerMessageId: text('provider_message_id').notNull(),
    internetMessageId: text('internet_message_id').notNull().default(''),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    toJson: jsonb('to_json').notNull().default([]),
    ccJson: jsonb('cc_json').notNull().default([]),
    subject: text('subject').notNull().default(''),
    snippet: text('snippet').notNull().default(''),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    isRead: boolean('is_read').notNull().default(false),
    bodyText: text('body_text').notNull().default(''),
    bodyHtmlSanitized: text('body_html_sanitized'),
    attachmentNames: jsonb('attachment_names').notNull().default([]),
    referencesJson: jsonb('references_json').notNull().default([]),
    listUnsubscribe: text('list_unsubscribe'),
  },
  (t) => [
    uniqueIndex('messages_account_provider').on(t.accountId, t.providerMessageId),
    index('messages_user_received').on(t.userId, t.receivedAt),
    index('messages_thread').on(t.threadId),
  ],
)
