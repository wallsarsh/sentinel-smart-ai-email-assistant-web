<script setup lang="ts">
import { ref } from 'vue'
import type { BgSettings } from '~/components/settings/BackgroundSettings.vue'
import type { BgRun, StatusAccount } from '~/components/settings/RunHistory.vue'

const { data: settings, refresh: reloadSettings } = await useFetch<BgSettings>('/api/settings')
const { data: status, refresh: reloadStatus } = await useFetch<{
  runs: BgRun[]
  accounts: StatusAccount[]
}>('/api/background/status')
const saving = ref(false)
const failed = ref(false)

async function save(patch: Partial<BgSettings>) {
  saving.value = true
  failed.value = false
  try {
    settings.value = await $fetch<BgSettings>('/api/settings', { method: 'PUT', body: patch })
  } catch {
    failed.value = true
    await reloadSettings()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">{{ $t('bg.title') }}</h1>
    <p style="color: var(--muted)">{{ $t('bg.limits') }}</p>
    <FailureBanner v-if="failed" :failure="{ kind: 'network' }" />
    <SettingsBackgroundSettings
      v-if="settings"
      :settings="settings"
      :accounts="status?.accounts ?? []"
      :saving="saving"
      @save="save"
    />
    <section aria-labelledby="bg-push">
      <h2 id="bg-push" class="font-semibold">{{ $t('bg.pushTitle') }}</h2>
      <SettingsPushPermission />
    </section>
    <div v-if="status">
      <SettingsRunHistory :runs="status.runs" :accounts="status.accounts" />
      <button type="button" class="mt-2 rounded border px-3 py-1" @click="reloadStatus()">
        {{ $t('bg.reload') }}
      </button>
    </div>
  </section>
</template>
