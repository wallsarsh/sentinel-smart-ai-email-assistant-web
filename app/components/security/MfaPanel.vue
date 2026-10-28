<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { failureOf } from '~/utils/step-up'
import type { WireFailure } from '~/utils/failure-presenter'

const enabled = ref(false)
const left = ref(0)
const setup = ref<{ secret: string; uri: string } | null>(null)
const codes = ref<string[] | null>(null)
const code = ref('')
const busy = ref(false)
const failure = ref<WireFailure | null>(null)

async function load() {
  try {
    const s = await $fetch<{ enabled: boolean; recoveryCodesLeft: number }>('/api/auth/mfa/status')
    enabled.value = s.enabled
    left.value = s.recoveryCodesLeft
  } catch {
    failure.value = { kind: 'network' }
  }
}
onMounted(load)

async function run(fn: () => Promise<void>) {
  busy.value = true
  failure.value = null
  try {
    await fn()
  } catch (e) {
    failure.value = failureOf(e)
  } finally {
    code.value = ''
    busy.value = false
  }
}

const begin = () =>
  run(async () => {
    setup.value = await $fetch<{ secret: string; uri: string }>('/api/auth/mfa/begin', {
      method: 'POST',
    })
  })
const confirm = () =>
  run(async () => {
    const r = await $fetch<{ recoveryCodes: string[] }>('/api/auth/mfa/confirm', {
      method: 'POST',
      body: { code: code.value.trim() },
    })
    codes.value = r.recoveryCodes
    setup.value = null
    await load()
  })
const disable = () =>
  run(async () => {
    await $fetch('/api/auth/mfa/disable', { method: 'POST', body: { code: code.value.trim() } })
    codes.value = null
    await load()
  })
const renew = () =>
  run(async () => {
    const r = await $fetch<{ recoveryCodes: string[] }>('/api/auth/mfa/recovery', {
      method: 'POST',
      body: { code: code.value.trim() },
    })
    codes.value = r.recoveryCodes
    await load()
  })
</script>

<template>
  <section class="space-y-3" aria-labelledby="sec-mfa">
    <h2 id="sec-mfa" class="font-semibold">{{ $t('security.mfa.title') }}</h2>
    <FailureBanner v-if="failure" :failure="failure" />

    <div v-if="codes" class="rounded border p-3" role="status" data-testid="recovery-codes">
      <p class="font-medium">{{ $t('security.mfa.saveCodes') }}</p>
      <ul class="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
        <li v-for="c in codes" :key="c">{{ c }}</li>
      </ul>
      <button
        type="button"
        class="mt-2 rounded border px-3 py-1"
        data-testid="codes-saved"
        @click="codes = null"
      >
        {{ $t('security.mfa.codesSaved') }}
      </button>
    </div>

    <template v-if="!enabled && !setup">
      <p>{{ $t('security.mfa.off') }}</p>
      <button
        type="button"
        class="rounded border px-3 py-2"
        :disabled="busy"
        data-testid="mfa-begin"
        @click="begin"
      >
        {{ $t('security.mfa.enable') }}
      </button>
    </template>

    <form v-else-if="setup" class="space-y-2" @submit.prevent="confirm">
      <p>{{ $t('security.mfa.scan') }}</p>
      <p class="break-all font-mono text-sm" data-testid="mfa-secret">{{ setup.secret }}</p>
      <p class="break-all text-xs" style="color: var(--muted)" data-testid="mfa-uri">
        {{ setup.uri }}
      </p>
      <label class="block text-sm">
        {{ $t('auth.mfa.code') }}
        <input
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          class="mt-1 w-full rounded border px-3 py-2"
          data-testid="mfa-code"
        />
      </label>
      <button
        type="submit"
        class="rounded border px-3 py-2"
        :disabled="busy || !code"
        data-testid="mfa-confirm"
      >
        {{ $t('security.mfa.confirm') }}
      </button>
    </form>

    <div v-else class="space-y-2">
      <p role="status">{{ $t('security.mfa.on', { n: left }) }}</p>
      <label class="block text-sm">
        {{ $t('security.mfa.needCode') }}
        <input
          v-model="code"
          autocomplete="one-time-code"
          class="mt-1 w-full rounded border px-3 py-2"
          data-testid="mfa-code"
        />
      </label>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded border px-3 py-2"
          :disabled="busy || !code"
          data-testid="mfa-renew"
          @click="renew"
        >
          {{ $t('security.mfa.renew') }}
        </button>
        <button
          type="button"
          class="rounded border px-3 py-2"
          :disabled="busy || !code"
          data-testid="mfa-disable"
          @click="disable"
        >
          {{ $t('security.mfa.disable') }}
        </button>
      </div>
    </div>
  </section>
</template>
