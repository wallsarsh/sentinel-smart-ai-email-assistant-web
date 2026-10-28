<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { browserEnv, disablePush, enablePush, pushState, type PushState } from '../../utils/push'

const state = ref<PushState>('off')
const cfg = ref<{ configured: boolean; publicKey: string }>({ configured: false, publicKey: '' })
const busy = ref(false)
const failed = ref(false)
const tested = ref(false)

onMounted(async () => {
  cfg.value = await $fetch<{ configured: boolean; publicKey: string }>('/api/push/config').catch(
    () => ({ configured: false, publicKey: '' }),
  )
  state.value = await pushState(browserEnv(), cfg.value.configured)
})
async function turnOn() {
  busy.value = true
  failed.value = false
  try {
    state.value = await enablePush(browserEnv(), cfg.value.publicKey, (sub) =>
      $fetch('/api/push/subscribe', { method: 'POST', body: sub }).then(() => undefined),
    )
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
async function turnOff() {
  busy.value = true
  await disablePush(browserEnv(), (endpoint) =>
    $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }).then(() => undefined),
  ).catch(() => undefined)
  state.value = await pushState(browserEnv(), cfg.value.configured)
  busy.value = false
}
async function test() {
  tested.value = false
  await $fetch('/api/push/test', { method: 'POST' }).catch(() => undefined)
  tested.value = true
}
</script>

<template>
  <section class="space-y-2 rounded border p-3" :aria-label="$t('push.title')">
    <h2 class="font-semibold">{{ $t('push.title') }}</h2>
    <p class="text-sm" role="status">{{ $t(`push.state.${state}`) }}</p>
    <p class="text-xs" style="color: var(--muted)">{{ $t('push.privacy') }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-if="state === 'off'"
        type="button"
        :disabled="busy"
        class="rounded border px-3 py-1 font-medium"
        @click="turnOn"
      >
        {{ $t('push.turnOn') }}
      </button>
      <template v-if="state === 'on'">
        <button type="button" :disabled="busy" class="rounded border px-3 py-1" @click="test">
          {{ $t('push.test') }}
        </button>
        <button type="button" :disabled="busy" class="rounded border px-3 py-1" @click="turnOff">
          {{ $t('push.turnOff') }}
        </button>
      </template>
    </div>
    <p v-if="failed" role="alert" class="text-sm">{{ $t('failure.unknown') }}</p>
    <p v-if="tested" role="status" class="text-sm">{{ $t('push.testSent') }}</p>
  </section>
</template>
