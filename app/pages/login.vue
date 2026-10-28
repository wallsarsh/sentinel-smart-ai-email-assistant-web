<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'
import { safeNext, type Me } from '~/utils/route-guard'

definePageMeta({ layout: 'auth' })
const route = useRoute()
const loaded = useState<boolean>('me-loaded')
const me = useState<Me>('me')
const busy = ref(false)
const failure = ref<WireFailure | null>(null)
const challenge = ref<string | null>(null)

const wire = (e: unknown): WireFailure =>
  (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }

async function finish() {
  loaded.value = false // the guard reads the new session
  me.value = null
  await navigateTo(safeNext(route.query.next))
}

async function login(c: { email: string; password: string }) {
  busy.value = true
  failure.value = null
  try {
    const r = await $fetch<{ mfaRequired?: boolean; challenge?: string }>('/api/auth/login', {
      method: 'POST',
      body: c,
    })
    if (r.mfaRequired && r.challenge) challenge.value = r.challenge
    else await finish()
  } catch (e) {
    failure.value = wire(e)
  } finally {
    busy.value = false
  }
}

async function code(v: string) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/auth/mfa/login', {
      method: 'POST',
      body: { challenge: challenge.value, code: v },
    })
    await finish()
  } catch (e) {
    failure.value = wire(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <AuthCodeForm v-if="challenge" :busy="busy" :failure="failure" @submit="code" />
    <AuthCredentialsForm v-else mode="login" :busy="busy" :failure="failure" @submit="login" />
    <p class="flex gap-4 text-sm">
      <NuxtLink to="/reset" class="underline">{{ $t('auth.forgot') }}</NuxtLink>
      <NuxtLink to="/signup" class="underline">{{ $t('auth.login.toSignup') }}</NuxtLink>
    </p>
  </div>
</template>
