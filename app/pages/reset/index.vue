<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ layout: 'auth' })
const email = ref('')
const sent = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  // The answer is the same whether or not the address has an account.
  await $fetch('/api/auth/password-reset', {
    method: 'POST',
    body: { email: email.value.trim() },
  }).catch(() => undefined)
  sent.value = true
  busy.value = false
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('auth.reset.title') }}</h1>
    <p v-if="sent" role="status">{{ $t('auth.reset.sent') }}</p>
    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <label class="block text-sm">
        {{ $t('auth.email') }}
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          required
          class="mt-1 w-full rounded border px-3 py-2"
        >
      </label>
      <button
        type="submit"
        class="w-full rounded px-4 py-2 font-medium"
        style="background: var(--primary); color: var(--primary-text)"
        :disabled="busy || !email"
      >
        {{ $t('auth.reset.submit') }}
      </button>
    </form>
    <NuxtLink to="/login" class="text-sm underline">{{ $t('auth.signup.toLogin') }}</NuxtLink>
  </div>
</template>
