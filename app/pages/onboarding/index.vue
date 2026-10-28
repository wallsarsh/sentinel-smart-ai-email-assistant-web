<script setup lang="ts">
import { ref } from 'vue'
import { asStep, stepIndex, type Step } from '~/utils/onboarding'
import type { Me } from '~/utils/route-guard'

definePageMeta({ layout: 'auth' })
type Settings = {
  'onboarding.step': number
  'brief.minutes': number
  'brief.notify': boolean
}
const me = useState<Me>('me')
const { data: s } = await useFetch<Settings>('/api/settings')
const { data: accounts } = await useFetch<{ accounts: unknown[] }>('/api/accounts')
const { data: providers } = await useFetch<{ providers: unknown[] }>('/api/ai/providers')

// Resumes at the stored step, also after a reload or on another device.
const step = ref<Step>(asStep(s.value?.['onboarding.step']))
const minutes = ref(s.value?.['brief.minutes'] ?? 450)
const notify = ref(s.value?.['brief.notify'] ?? false)
const busy = ref(false)

const put = (patch: Record<string, unknown>) =>
  $fetch('/api/settings', { method: 'PUT', body: patch }).catch(() => undefined)

async function go(next: Step) {
  step.value = next
  await put({ 'onboarding.step': stepIndex(next) })
}
async function leave() {
  busy.value = true
  await put({ 'onboarding.complete': true })
  if (me.value) me.value = { ...me.value, onboarded: true }
  await navigateTo('/')
}
async function brief(patch: { 'brief.minutes'?: number; 'brief.notify'?: boolean }) {
  if (patch['brief.minutes'] !== undefined) minutes.value = patch['brief.minutes']
  if (patch['brief.notify'] !== undefined) notify.value = patch['brief.notify']
  await put(patch)
}
</script>

<template>
  <OnboardingFlow
    :step="step"
    :account-count="accounts?.accounts.length ?? 0"
    :ai-ready="(providers?.providers.length ?? 0) > 0"
    :brief-minutes="minutes"
    :brief-notify="notify"
    :busy="busy"
    @go="go"
    @skip="leave"
    @finish="leave"
    @brief="brief"
  >
    <template #push><SettingsPushPermission /></template>
  </OnboardingFlow>
</template>
