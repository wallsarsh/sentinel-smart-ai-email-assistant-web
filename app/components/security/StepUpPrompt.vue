<script setup lang="ts">
import { ref } from 'vue'
import { failureOf } from '~/utils/step-up'
import type { WireFailure } from '~/utils/failure-presenter'

const emit = defineEmits<{ verified: []; cancel: [] }>()
const code = ref('')
const busy = ref(false)
const failure = ref<WireFailure | null>(null)

async function submit() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/auth/mfa/step-up', { method: 'POST', body: { code: code.value.trim() } })
    emit('verified')
  } catch (e) {
    failure.value = failureOf(e)
  } finally {
    code.value = ''
    busy.value = false
  }
}
</script>

<template>
  <form
    class="space-y-2 rounded border p-3"
    role="group"
    :aria-label="$t('security.stepUp.title')"
    @submit.prevent="submit"
  >
    <p class="font-medium">{{ $t('security.stepUp.title') }}</p>
    <FailureBanner v-if="failure" :failure="failure" />
    <label class="block text-sm">
      {{ $t('privacy.stepUp') }}
      <input
        v-model="code"
        autocomplete="one-time-code"
        class="mt-1 w-full rounded border px-3 py-2"
        data-testid="stepup-code"
      />
    </label>
    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded border px-3 py-2"
        :disabled="busy || !code"
        data-testid="stepup-submit"
      >
        {{ $t('auth.mfa.submit') }}
      </button>
      <button type="button" class="rounded border px-3 py-2" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </form>
</template>
