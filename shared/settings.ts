import { z } from 'zod'

const bool = (d: boolean) => z.boolean().default(d)
const minutes = z.number().int().min(0).max(1439)

/**
 * Every per-user setting, with its type and default. Later tasks read these by
 * key; unknown keys are rejected. This table is the single place defaults live.
 */
export const settingsSchema = {
  // onboarding
  'onboarding.complete': bool(false),
  'onboarding.step': z.number().int().min(0).max(10).default(0),
  // writing profile (the display name lives on the user record)
  'profile.role': z.string().trim().max(80).default(''),
  'profile.signOff': z.string().trim().max(80).default(''),
  'profile.signature': z.string().max(1000).default(''),
  'profile.styleNotes': z.string().trim().max(300).default(''),
  'profile.language': z.string().trim().max(20).default(''),
  // sending
  'send.undoSeconds': z.number().int().min(0).max(30).default(5),
  'send.requireStepUp': bool(true),
  'send.blockOnPlaceholders': bool(true),
  'send.warnExternalRecipients': bool(true),
  'send.dailyLimit': z.number().int().min(0).max(1000).default(50),
  // AI privacy
  /** Also send newsletters and automated notifications to the AI (off: they are labelled by rules). */
  'ai.processBulk': bool(false),
  'privacy.subjectOnly': bool(false),
  'privacy.maxChars': z.number().int().min(500).max(20000).default(6000),
  'privacy.redactCards': bool(true),
  'privacy.redactIbans': bool(true),
  'privacy.redactPhones': bool(true),
  'privacy.redactEmails': bool(true),
  // AI limits and prices
  'ai.dailyTokenCap': z.number().int().min(0).default(0),
  'ai.dailyCostCapMicros': z.number().int().min(0).default(0),
  'ai.prices': z
    .record(z.string(), z.object({ in: z.number().min(0), out: z.number().min(0) }))
    .default({}),
  // retention
  'retention.days': z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  // background
  'bg.intervalMinutes': z
    .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)])
    .default(15),
  'bg.aiEnabled': bool(false),
  // notifications
  'notify.mode': z.enum(['important', 'needs_reply', 'all', 'none']).default('important'),
  'notify.previews': bool(false),
  'notify.quietStart': minutes.nullable().default(null),
  'notify.quietEnd': minutes.nullable().default(null),
  'notify.mutedAccounts': z.array(z.string()).max(50).default([]),
  // brief
  'brief.minutes': minutes.default(450),
  'brief.notify': bool(false),
  // telemetry
  'telemetry.crashReports': bool(false),
  // UI
  'ui.inboxSegment': z
    .enum(['all', 'needs_reply', 'actions', 'important', 'fyi', 'newsletters'])
    .default('all'),
} as const

export type SettingKey = keyof typeof settingsSchema
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchema)[K]>
export const settingKeys = Object.keys(settingsSchema) as SettingKey[]

export const isSettingKey = (k: string): k is SettingKey => k in settingsSchema

/** Defaults for every key. */
export function defaultSettings(): { [K in SettingKey]: SettingValue<K> } {
  return Object.fromEntries(
    settingKeys.map((k) => [k, settingsSchema[k].parse(undefined)]),
  ) as never
}

/** Validates a patch; unknown keys and bad values are reported, nothing is half-applied. */
export function parseSettingsPatch(
  patch: Record<string, unknown>,
):
  | { ok: true; value: Partial<{ [K in SettingKey]: SettingValue<K> }> }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const value: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!isSettingKey(k)) {
      errors[k] = 'unknown_key'
      continue
    }
    const r = settingsSchema[k].safeParse(v)
    if (r.success) value[k] = r.data
    else errors[k] = 'invalid_value'
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: value as never }
}
