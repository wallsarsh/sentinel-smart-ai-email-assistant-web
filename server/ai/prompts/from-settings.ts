import type { SettingKey, SettingValue } from '../../../shared/settings'
import type { BuilderOptions } from './builder'

/**
 * The privacy settings as prompt builder options. Every AI feature builds its
 * PromptBuilder from the user's current settings through this, read fresh for
 * each call, so a change in Privacy applies to the very next request.
 */
export function builderOptions(s: {
  [K in Extract<SettingKey, `privacy.${string}`>]: SettingValue<K>
}): BuilderOptions {
  return {
    compact: true,
    triageBodyCap: s['privacy.maxChars'],
    draftBodyCap: Math.max(s['privacy.maxChars'], 6000),
    triageSubjectOnly: s['privacy.subjectOnly'],
    redaction: {
      cards: s['privacy.redactCards'],
      ibans: s['privacy.redactIbans'],
      phones: s['privacy.redactPhones'],
      otherEmails: s['privacy.redactEmails'],
    },
  }
}
