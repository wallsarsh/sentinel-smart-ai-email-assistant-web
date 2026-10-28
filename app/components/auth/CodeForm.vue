<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'

defineProps<{ busy?: boolean; failure?: WireFailure | null }>()
const emit = defineEmits<{ submit: [string] }>()
const code = ref('')
function submit() {
  emit('submit', code.value.trim())
  code.value = ''
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <h1 class="text-2xl font-semibold">{{ $t('auth.mfa.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('auth.mfa.hint') }}</p>
    <FailureBanner v-if="failure" :failure="failure" />
    <label class="block text-sm">
      {{ $t('auth.mfa.code') }}
      <input
        id="auth-code"
        v-model="code"
        inputmode="text"
        autocomplete="one-time-code"
        required
        class="mt-1 w-full rounded border px-3 py-2"
      />
    </label>
    <button
      type="submit"
      class="w-full rounded px-4 py-2 font-medium"
      style="background: var(--primary); color: var(--primary-text)"
      :disabled="busy || !code"
    >
      {{ $t('auth.mfa.submit') }}
    </button>
  </form>
</template>
