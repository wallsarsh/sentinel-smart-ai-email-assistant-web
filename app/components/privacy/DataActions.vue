<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'

const props = defineProps<{ mfaEnabled: boolean }>()
const emit = defineEmits<{ deleted: [] }>()

type Pending = null | 'export' | 'delete'
const busy = ref(false)
const message = ref<'' | 'cleared' | 'exported' | 'failed'>('')
const failure = ref<WireFailure | null>(null)
const confirming = ref<'' | 'clear' | 'delete'>('')
const stepUp = ref<Pending>(null)
const code = ref('')
const password = ref('')

const wire = (e: unknown): { status?: number; message?: string; failure: WireFailure } => {
  const x = e as { statusCode?: number; statusMessage?: string; data?: { error?: WireFailure } }
  return {
    ...(x.statusCode !== undefined ? { status: x.statusCode } : {}),
    ...(x.statusMessage !== undefined ? { message: x.statusMessage } : {}),
    failure: x.data?.error ?? { kind: 'network' },
  }
}

async function clearCache() {
  busy.value = true
  message.value = ''
  try {
    await $fetch('/api/account/clear-cache', { method: 'POST' })
    message.value = 'cleared'
  } catch {
    message.value = 'failed'
  } finally {
    busy.value = false
    confirming.value = ''
  }
}

async function exportData() {
  busy.value = true
  message.value = ''
  failure.value = null
  try {
    const bytes = await $fetch<Blob>('/api/account/export', {
      method: 'POST',
      responseType: 'blob',
    })
    const url = URL.createObjectURL(bytes)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sentinel-export.zip'
    a.click()
    URL.revokeObjectURL(url)
    message.value = 'exported'
    stepUp.value = null
  } catch (e) {
    const w = wire(e)
    if (w.status === 403 && w.message === 'step_up_required') stepUp.value = 'export'
    else message.value = 'failed'
  } finally {
    busy.value = false
  }
}

async function verifyCode() {
  const pending = stepUp.value
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/auth/mfa/step-up', { method: 'POST', body: { code: code.value.trim() } })
    code.value = ''
    stepUp.value = null
    if (pending === 'export') await exportData()
    else await deleteAccount()
  } catch (e) {
    failure.value = wire(e).failure
  } finally {
    busy.value = false
    code.value = ''
  }
}

async function deleteAccount() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/account/delete', { method: 'POST', body: { password: password.value } })
    password.value = ''
    emit('deleted')
  } catch (e) {
    const w = wire(e)
    if (w.status === 403 && w.message === 'step_up_required') stepUp.value = 'delete'
    else failure.value = w.failure
  } finally {
    password.value = ''
    busy.value = false
  }
}
function cancelDelete() {
  confirming.value = ''
  password.value = ''
}
void props
</script>

<template>
  <div class="space-y-6">
    <p v-if="message" role="status" data-testid="message">{{ $t(`privacy.message.${message}`) }}</p>
    <FailureBanner v-if="failure" :failure="failure" />

    <section class="space-y-2" aria-labelledby="dx-cache">
      <h2 id="dx-cache" class="font-semibold">{{ $t('privacy.cache.title') }}</h2>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.cache.hint') }}</p>
      <button
        v-if="confirming !== 'clear'"
        type="button"
        class="rounded border px-3 py-2"
        data-testid="clear"
        @click="confirming = 'clear'"
      >
        {{ $t('privacy.cache.action') }}
      </button>
      <div v-else class="flex gap-2" role="group" :aria-label="$t('privacy.cache.title')">
        <button
          type="button"
          class="rounded border px-3 py-2"
          data-testid="clear-confirm"
          :disabled="busy"
          @click="clearCache"
        >
          {{ $t('privacy.cache.confirm') }}
        </button>
        <button type="button" class="rounded border px-3 py-2" @click="confirming = ''">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </section>

    <section class="space-y-2" aria-labelledby="dx-export">
      <h2 id="dx-export" class="font-semibold">{{ $t('privacy.export.title') }}</h2>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.export.hint') }}</p>
      <button
        type="button"
        class="rounded border px-3 py-2"
        data-testid="export"
        :disabled="busy"
        @click="exportData"
      >
        {{ $t('privacy.export.action') }}
      </button>
    </section>

    <form
      v-if="stepUp"
      class="space-y-2 rounded border p-3"
      data-testid="step-up"
      @submit.prevent="verifyCode"
    >
      <label class="block text-sm">
        {{ $t('privacy.stepUp') }}
        <input
          v-model="code"
          autocomplete="one-time-code"
          class="mt-1 w-full rounded border px-3 py-2"
          data-testid="step-up-code"
        >
      </label>
      <button type="submit" class="rounded border px-3 py-2" :disabled="busy || !code">
        {{ $t('auth.mfa.submit') }}
      </button>
    </form>

    <section class="space-y-2" aria-labelledby="dx-delete">
      <h2 id="dx-delete" class="font-semibold">{{ $t('privacy.delete.title') }}</h2>
      <p class="text-sm" style="color: var(--muted)">{{ $t('privacy.delete.hint') }}</p>
      <button
        v-if="confirming !== 'delete'"
        type="button"
        class="rounded border px-3 py-2"
        data-testid="delete"
        @click="confirming = 'delete'"
      >
        {{ $t('privacy.delete.action') }}
      </button>
      <form v-else class="space-y-2" @submit.prevent="deleteAccount">
        <label class="block text-sm">
          {{ $t('privacy.delete.password') }}
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 w-full rounded border px-3 py-2"
            data-testid="delete-password"
          >
        </label>
        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded border px-3 py-2 font-medium"
            data-testid="delete-confirm"
            :disabled="busy || !password"
          >
            {{ $t('privacy.delete.confirm') }}
          </button>
          <button type="button" class="rounded border px-3 py-2" @click="cancelDelete">
            {{ $t('common.cancel') }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
