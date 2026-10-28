import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { aiKindEnum, aiTaskEnum, createdAt, id, userId } from './columns'
import { users } from './auth'

/** Ciphertext only (envelope encryption, T022). */
export const secrets = pgTable(
  'secrets',
  {
    userId: userId(),
    name: text('name').notNull(),
    ciphertext: text('ciphertext').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('secrets_user_name').on(t.userId, t.name)],
)

/** Per-user data key, wrapped by the KEK. */
export const dataKeys = pgTable('data_keys', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wrappedKey: text('wrapped_key').notNull(),
  kekVersion: integer('kek_version').notNull().default(1),
})

export const aiProviders = pgTable(
  'ai_providers',
  {
    id: id(),
    userId: userId(),
    kind: aiKindEnum('kind').notNull(),
    displayName: text('display_name').notNull(),
    baseUrl: text('base_url').notNull(),
    presetId: text('preset_id'),
    status: text('status').notNull().default('ok'),
    consentGivenAt: timestamp('consent_given_at', { withTimezone: true }),
    modelsJson: jsonb('models_json').notNull().default([]),
    optionsJson: jsonb('options_json').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('ai_providers_user').on(t.userId)],
)

export const aiTaskRoutes = pgTable(
  'ai_task_routes',
  {
    userId: userId(),
    task: aiTaskEnum('task').notNull(),
    position: integer('position').notNull(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    paramsJson: jsonb('params_json').notNull().default({}),
  },
  (t) => [uniqueIndex('ai_routes_pk').on(t.userId, t.task, t.position)],
)

export const usageRecords = pgTable(
  'usage_records',
  {
    id: id(),
    userId: userId(),
    providerId: uuid('provider_id'),
    model: text('model').notNull(),
    task: aiTaskEnum('task').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    costMicros: integer('cost_micros').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('usage_user_created').on(t.userId, t.createdAt)],
)

export const settings = pgTable(
  'settings',
  {
    userId: userId(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
  },
  (t) => [uniqueIndex('settings_pk').on(t.userId, t.key)],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: userId(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: createdAt(),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('push_endpoint').on(t.endpoint)],
)

export const bgRuns = pgTable(
  'bg_runs',
  {
    id: id(),
    userId: userId(),
    accountId: uuid('account_id'),
    trigger: text('trigger').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    outcome: text('outcome'),
    newMessages: integer('new_messages').notNull().default(0),
    triaged: integer('triaged').notNull().default(0),
    errorCode: text('error_code'),
  },
  (t) => [index('bg_runs_user_started').on(t.userId, t.startedAt)],
)

export const notified = pgTable(
  'notified',
  {
    userId: userId(),
    key: text('key').notNull(),
    at: createdAt(),
  },
  (t) => [uniqueIndex('notified_pk').on(t.userId, t.key)],
)
