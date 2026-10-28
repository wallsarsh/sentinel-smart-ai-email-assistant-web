<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type State =
  'waiting' | 'cancelled' | 'sending' | 'sent' | 'failed' | 'unknown' | 'expired' | 'unknown_ref'
const props = defineProps<{ nonce: string; releaseAt: string; pollMs?: number }>()
const emit = defineEmits<{ done: [State] }>()

const state = ref<State>('waiting')
const now = ref(Date.now())
const undoing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
const FINAL: State[] = ['cancelled', 'sent', 'failed', 'unknown', 'expired', 'unknown_ref']

const seconds = computed(() =>
  Math.max(0, Math.ceil((new Date(props.releaseAt).getTime() - now.value) / 1000)),
)

async function poll() {
  now.value = Date.now()
  try {
    const r = await $fetch<{ state: State }>('/api/send/status', {
      method: 'POST',
      body: { nonce: props.nonce },
    })
    state.value = r.state
    if (FINAL.includes(r.state)) {
      clearInterval(timer)
      emit('done', r.state)
    }
  } catch {
    /* keep waiting: the server decides, not this tab */
  }
}
async function undo() {
  undoing.value = true
  try {
    const r = await $fetch<{ revoked: boolean }>('/api/send/undo', {
      method: 'POST',
      body: { nonce: props.nonce },
    })
    if (!r.revoked)
      await poll() // too late: it was already released
    else {
      state.value = 'cancelled'
      clearInterval(timer)
      emit('done', 'cancelled')
    }
  } finally {
    undoing.value = false
  }
}
onMounted(() => {
  void poll()
  timer = setInterval(poll, props.pollMs ?? 1000)
})
// Leaving the page does not cancel or speed up anything: the server owns the timer.
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="flex flex-wrap items-center gap-3 rounded border p-3"
  >
    <template v-if="state === 'waiting'">
      <span>{{ $t('send.sendingIn', { n: seconds }) }}</span>
      <button
        type="button"
        :disabled="undoing"
        class="rounded border px-3 py-1 font-medium"
        @click="undo"
      >
        {{ $t('send.undo') }}
      </button>
    </template>
    <span v-else>{{ $t(`send.state.${state}`) }}</span>
  </div>
</template>
