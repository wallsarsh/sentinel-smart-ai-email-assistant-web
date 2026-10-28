<script setup lang="ts">
import { computed } from 'vue'
import { minutesToTime, timeToMinutes } from '~/utils/time-of-day'

export type BgSettings = {
  'bg.intervalMinutes': number
  'bg.aiEnabled': boolean
  'notify.mode': 'important' | 'needs_reply' | 'all' | 'none'
  'notify.previews': boolean
  'notify.quietStart': number | null
  'notify.quietEnd': number | null
  'notify.mutedAccounts': string[]
  'brief.minutes': number
  'brief.notify': boolean
}
export type BgAccount = { id: string; email: string }

const props = defineProps<{ settings: BgSettings; accounts: BgAccount[]; saving?: boolean }>()
const emit = defineEmits<{ save: [Partial<BgSettings>] }>()

const INTERVALS = [5, 15, 30, 60]
const MODES = ['important', 'needs_reply', 'all', 'none'] as const
const quietOn = computed(
  () => props.settings['notify.quietStart'] !== null && props.settings['notify.quietEnd'] !== null,
)

function setQuiet(on: boolean) {
  emit(
    'save',
    on
      ? { 'notify.quietStart': 22 * 60, 'notify.quietEnd': 7 * 60 }
      : { 'notify.quietStart': null, 'notify.quietEnd': null },
  )
}
function setTime(key: 'notify.quietStart' | 'notify.quietEnd' | 'brief.minutes', v: string) {
  const m = timeToMinutes(v)
  if (m !== null) emit('save', { [key]: m })
}
function toggleMuted(id: string, muted: boolean) {
  const cur = props.settings['notify.mutedAccounts'].filter((x) => x !== id)
  emit('save', { 'notify.mutedAccounts': muted ? [...cur, id] : cur })
}
</script>

<template>
  <div class="space-y-6">
    <fieldset class="space-y-3">
      <legend class="font-semibold">{{ $t('bg.checking') }}</legend>
      <label class="flex items-center justify-between gap-3">
        <span>{{ $t('bg.interval') }}</span>
        <select
          class="rounded border px-2 py-1"
          :value="settings['bg.intervalMinutes']"
          data-testid="interval"
          @change="
            emit('save', {
              'bg.intervalMinutes': Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option v-for="m in INTERVALS" :key="m" :value="m">
            {{ $t('bg.everyMinutes', { n: m }) }}
          </option>
        </select>
      </label>
      <label class="flex items-start gap-2">
        <input
          type="checkbox"
          :checked="settings['bg.aiEnabled']"
          data-testid="ai"
          @change="emit('save', { 'bg.aiEnabled': ($event.target as HTMLInputElement).checked })"
        >
        <span
          >{{ $t('bg.ai') }}<br ><span class="text-sm" style="color: var(--muted)">{{
            $t('bg.aiHint')
          }}</span></span
        >
      </label>
    </fieldset>

    <fieldset class="space-y-3">
      <legend class="font-semibold">{{ $t('bg.notify') }}</legend>
      <label class="flex items-center justify-between gap-3">
        <span>{{ $t('bg.mode') }}</span>
        <select
          class="rounded border px-2 py-1"
          :value="settings['notify.mode']"
          data-testid="mode"
          @change="
            emit('save', {
              'notify.mode': ($event.target as HTMLSelectElement)
                .value as BgSettings['notify.mode'],
            })
          "
        >
          <option v-for="m in MODES" :key="m" :value="m">{{ $t(`bg.modes.${m}`) }}</option>
        </select>
      </label>
      <label class="flex items-start gap-2">
        <input
          type="checkbox"
          :checked="settings['notify.previews']"
          data-testid="previews"
          @change="emit('save', { 'notify.previews': ($event.target as HTMLInputElement).checked })"
        >
        <span
          >{{ $t('bg.previews') }}<br ><span class="text-sm" style="color: var(--muted)">{{
            $t('bg.previewsHint')
          }}</span></span
        >
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="quietOn"
          data-testid="quiet"
          @change="setQuiet(($event.target as HTMLInputElement).checked)"
        >
        {{ $t('bg.quiet') }}
      </label>
      <div v-if="quietOn" class="flex flex-wrap gap-4 pl-6">
        <label class="flex flex-col text-sm"
          >{{ $t('bg.quietFrom') }}
          <input
            type="time"
            class="rounded border px-2 py-1"
            :value="minutesToTime(settings['notify.quietStart']!)"
            data-testid="quiet-start"
            @change="setTime('notify.quietStart', ($event.target as HTMLInputElement).value)"
          >
        </label>
        <label class="flex flex-col text-sm"
          >{{ $t('bg.quietTo') }}
          <input
            type="time"
            class="rounded border px-2 py-1"
            :value="minutesToTime(settings['notify.quietEnd']!)"
            data-testid="quiet-end"
            @change="setTime('notify.quietEnd', ($event.target as HTMLInputElement).value)"
          >
        </label>
        <p class="basis-full text-sm" style="color: var(--muted)">{{ $t('bg.quietHint') }}</p>
      </div>
      <div v-if="accounts.length > 1" class="space-y-1">
        <p class="font-medium">{{ $t('bg.muteAccounts') }}</p>
        <label v-for="a in accounts" :key="a.id" class="flex items-center gap-2">
          <input
            type="checkbox"
            :checked="settings['notify.mutedAccounts'].includes(a.id)"
            :data-testid="`mute-${a.id}`"
            @change="toggleMuted(a.id, ($event.target as HTMLInputElement).checked)"
          >
          {{ a.email }}
        </label>
      </div>
    </fieldset>

    <fieldset class="space-y-3">
      <legend class="font-semibold">{{ $t('bg.briefSection') }}</legend>
      <label class="flex items-center justify-between gap-3">
        <span>{{ $t('bg.briefTime') }}</span>
        <input
          type="time"
          class="rounded border px-2 py-1"
          :value="minutesToTime(settings['brief.minutes'])"
          data-testid="brief-time"
          @change="setTime('brief.minutes', ($event.target as HTMLInputElement).value)"
        >
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="settings['brief.notify']"
          data-testid="brief-notify"
          @change="emit('save', { 'brief.notify': ($event.target as HTMLInputElement).checked })"
        >
        {{ $t('bg.briefNotify') }}
      </label>
    </fieldset>
    <p v-if="saving" role="status" class="text-sm">{{ $t('common.saving') }}</p>
  </div>
</template>
