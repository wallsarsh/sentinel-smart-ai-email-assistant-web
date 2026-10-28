<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'

definePageMeta({ layout: 'auth' })
const route = useRoute()
const password = ref('')
const done = ref(false)
const busy = ref(false)
const failure = ref<WireFailure | null>(null)

async function submit() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/auth/password-reset-confirm', {
      method: 'POST',
      body: { token: String(route.query.token ?? ''), password: password.value },
    })
    done.value = true
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  } finally {
    password.value = ''
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('auth.reset.confirmTitle') }}</h1>
    <p v-if="done" role="status">
      {{ $t('auth.reset.done') }}
      <NuxtLink to="/login" class="underline">{{ $t('auth.login.title') }}</NuxtLink>
    </p>
    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <FailureBanner v-if="failure" :failure="failure" />
      <label class="block text-sm">
        {{ $t('auth.newPassword') }}
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          class="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        class="w-full rounded px-4 py-2 font-medium"
        style="background: var(--primary); color: var(--primary-text)"
        :disabled="busy || !password"
      >
        {{ $t('auth.reset.confirmSubmit') }}
      </button>
    </form>
  </div>
</template>
