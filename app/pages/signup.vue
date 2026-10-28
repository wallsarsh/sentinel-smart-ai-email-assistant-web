<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'
import type { Me } from '~/utils/route-guard'

definePageMeta({ layout: 'auth' })
const loaded = useState<boolean>('me-loaded')
const me = useState<Me>('me')
const busy = ref(false)
const failure = ref<WireFailure | null>(null)

async function signup(c: { email: string; password: string }) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/auth/signup', {
      method: 'POST',
      body: { ...c, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    })
    loaded.value = false
    me.value = null
    await navigateTo('/onboarding')
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <AuthCredentialsForm mode="signup" :busy="busy" :failure="failure" @submit="signup" />
    <p class="text-sm">
      <NuxtLink to="/login" class="underline">{{ $t('auth.signup.toLogin') }}</NuxtLink>
    </p>
  </div>
</template>
