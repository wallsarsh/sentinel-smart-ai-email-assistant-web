<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'

const props = defineProps<{
  mode: 'login' | 'signup'
  busy?: boolean
  failure?: WireFailure | null
}>()
const emit = defineEmits<{ submit: [{ email: string; password: string }] }>()
const email = ref('')
const password = ref('')

function submit() {
  if (props.busy) return
  emit('submit', { email: email.value.trim(), password: password.value })
  password.value = ''
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <h1 class="text-2xl font-semibold">{{ $t(`auth.${mode}.title`) }}</h1>
    <FailureBanner v-if="failure" :failure="failure" />
    <label class="block text-sm">
      {{ $t('auth.email') }}
      <input
        id="auth-email"
        v-model="email"
        type="email"
        autocomplete="username"
        required
        class="mt-1 w-full rounded border px-3 py-2"
      />
    </label>
    <label class="block text-sm">
      {{ $t('auth.password') }}
      <input
        id="auth-password"
        v-model="password"
        type="password"
        :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        required
        class="mt-1 w-full rounded border px-3 py-2"
      />
    </label>
    <p v-if="mode === 'signup'" class="text-sm" style="color: var(--muted)">
      {{ $t('auth.signup.passwordHint') }}
    </p>
    <button
      type="submit"
      class="w-full rounded px-4 py-2 font-medium"
      style="background: var(--primary); color: var(--primary-text)"
      :disabled="busy || !email || !password"
    >
      {{ $t(`auth.${mode}.submit`) }}
    </button>
  </form>
</template>
