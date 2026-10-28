<script setup lang="ts">
import { clearOfflineData } from '~/utils/offline'
import { ref } from 'vue'
import type { PrivacySettings } from '~/components/privacy/PrivacyForm.vue'
import type { Me } from '~/utils/route-guard'

const { data: settings } = await useFetch<PrivacySettings>('/api/settings')
const { data: acc, refresh } = await useFetch<{
  accounts: { id: string; email: string; aiExcluded: boolean }[]
}>('/api/accounts')
const { data: me } = await useFetch<Me & { mfaEnabled: boolean }>('/api/auth/me')
const failed = ref(false)

async function save(patch: Partial<PrivacySettings>) {
  failed.value = false
  try {
    settings.value = await $fetch<PrivacySettings>('/api/settings', { method: 'PUT', body: patch })
  } catch {
    failed.value = true
  }
}
async function exclude(v: { id: string; excluded: boolean }) {
  failed.value = false
  try {
    await $fetch(`/api/accounts/${v.id}`, { method: 'PATCH', body: { aiExcluded: v.excluded } })
  } catch {
    failed.value = true
  }
  await refresh()
}
async function deleted() {
  await clearOfflineData()
  const loaded = useState<boolean>('me-loaded')
  const state = useState<Me>('me')
  loaded.value = false
  state.value = null
  await navigateTo('/login')
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">{{ $t('privacy.title') }}</h1>
    <FailureBanner v-if="failed" :failure="{ kind: 'network' }" />
    <PrivacyForm
      v-if="settings"
      :settings="settings"
      :accounts="acc?.accounts ?? []"
      @save="save"
      @exclude="exclude"
    />
    <PrivacyDataActions :mfa-enabled="me?.mfaEnabled ?? false" @deleted="deleted" />
  </section>
</template>
