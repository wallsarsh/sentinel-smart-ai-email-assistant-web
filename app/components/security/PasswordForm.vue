<script setup lang="ts">
import { ref } from 'vue'
import { failureOf, needsStepUp } from '~/utils/step-up'
import type { WireFailure } from '~/utils/failure-presenter'

const current = ref('')
const next = ref('')
const busy = ref(false)
const done = ref(false)
const failure = ref<WireFailure | null>(null)
const askCode = ref(false)

async function submit() {
  busy.value = true
  failure.value = null
  done.value = false
  try {
    await $fetch('/api/auth/password', {
      method: 'POST',
      body: { current: current.value, next: next.value },
    })
    done.value = true
    askCode.value = false
    current.value = ''
    next.value = ''
  } catch (e) {
    if (needsStepUp(e)) askCode.value = true
    else {
      failure.value = failureOf(e)
      current.value = ''
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-3" aria-labelledby="sec-password">
    <h2 id="sec-password" class="font-semibold">{{ $t('security.password.title') }}</h2>
    <p v-if="done" role="status" data-testid="password-done">{{ $t('security.password.done') }}</p>
    <FailureBanner v-if="failure" :failure="failure" />
    <SecurityStepUpPrompt v-if="askCode" @verified="submit" @cancel="askCode = false" />
    <form class="space-y-3" novalidate @submit.prevent="submit">
      <label class="block text-sm">
        {{ $t('security.password.current') }}
        <input
          v-model="current"
          type="password"
          autocomplete="current-password"
          class="mt-1 w-full rounded border px-3 py-2"
          data-testid="pw-current"
        />
      </label>
      <label class="block text-sm">
        {{ $t('auth.newPassword') }}
        <input
          v-model="next"
          type="password"
          autocomplete="new-password"
          class="mt-1 w-full rounded border px-3 py-2"
          data-testid="pw-next"
        />
      </label>
      <p class="text-sm" style="color: var(--muted)">{{ $t('security.password.hint') }}</p>
      <button
        type="submit"
        class="rounded border px-4 py-2"
        :disabled="busy || !current || !next"
        data-testid="pw-submit"
      >
        {{ $t('security.password.submit') }}
      </button>
    </form>
  </section>
</template>
