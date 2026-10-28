<script setup lang="ts">
export type PrivacySettings = {
  'privacy.subjectOnly': boolean
  'privacy.maxChars': number
  'privacy.redactCards': boolean
  'privacy.redactIbans': boolean
  'privacy.redactPhones': boolean
  'privacy.redactEmails': boolean
  'retention.days': 7 | 30 | 90
}
export type PrivacyAccount = { id: string; email: string; aiExcluded: boolean }

defineProps<{ settings: PrivacySettings; accounts: PrivacyAccount[] }>()
const emit = defineEmits<{
  save: [Partial<PrivacySettings>]
  exclude: [{ id: string; excluded: boolean }]
}>()

const REDACT = ['Cards', 'Ibans', 'Phones', 'Emails'] as const
const clamp = (v: string) => Math.min(20000, Math.max(500, Math.round(Number(v) || 6000)))
</script>

<template>
  <div class="space-y-6">
    <fieldset class="min-w-0 space-y-3">
      <legend class="font-semibold">{{ $t('privacy.scope') }}</legend>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.scopeHint') }}</p>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="scope"
          :checked="!settings['privacy.subjectOnly']"
          data-testid="scope-body"
          @change="emit('save', { 'privacy.subjectOnly': false })"
        />
        {{ $t('privacy.scopeBody') }}
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="scope"
          :checked="settings['privacy.subjectOnly']"
          data-testid="scope-subject"
          @change="emit('save', { 'privacy.subjectOnly': true })"
        />
        {{ $t('privacy.scopeSubject') }}
      </label>
      <label class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ $t('privacy.maxChars') }}</span>
        <input
          type="number"
          min="500"
          max="20000"
          step="500"
          class="w-28 rounded border px-2 py-1"
          :value="settings['privacy.maxChars']"
          :disabled="settings['privacy.subjectOnly']"
          data-testid="max-chars"
          @change="
            emit('save', { 'privacy.maxChars': clamp(($event.target as HTMLInputElement).value) })
          "
        />
      </label>
    </fieldset>

    <fieldset class="min-w-0 space-y-2">
      <legend class="font-semibold">{{ $t('privacy.redact') }}</legend>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.redactHint') }}</p>
      <label v-for="k in REDACT" :key="k" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="settings[`privacy.redact${k}`]"
          :data-testid="`redact-${k.toLowerCase()}`"
          @change="
            emit('save', { [`privacy.redact${k}`]: ($event.target as HTMLInputElement).checked })
          "
        />
        {{ $t(`privacy.redactKinds.${k.toLowerCase()}`) }}
      </label>
    </fieldset>

    <fieldset v-if="accounts.length" class="min-w-0 space-y-2">
      <legend class="font-semibold">{{ $t('privacy.exclude') }}</legend>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.excludeHint') }}</p>
      <label v-for="a in accounts" :key="a.id" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="a.aiExcluded"
          :data-testid="`exclude-${a.id}`"
          @change="
            emit('exclude', { id: a.id, excluded: ($event.target as HTMLInputElement).checked })
          "
        />
        {{ a.email }}
      </label>
    </fieldset>

    <fieldset class="min-w-0 space-y-2">
      <legend class="font-semibold">{{ $t('privacy.retention') }}</legend>
      <label class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ $t('privacy.keepMail') }}</span>
        <select
          class="rounded border px-2 py-1"
          :value="settings['retention.days']"
          data-testid="retention"
          @change="
            emit('save', {
              'retention.days': Number(($event.target as HTMLSelectElement).value) as 7 | 30 | 90,
            })
          "
        >
          <option v-for="d in [7, 30, 90]" :key="d" :value="d">
            {{ $t('privacy.days', { n: d }) }}
          </option>
        </select>
      </label>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.retentionHint') }}</p>
    </fieldset>
  </div>
</template>
