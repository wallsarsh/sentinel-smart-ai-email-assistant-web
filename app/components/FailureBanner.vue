<script setup lang="ts">
import { computed } from 'vue'
import { presentFailure, type RecoveryAction, type WireFailure } from '../utils/failure-presenter'

const props = defineProps<{ failure: WireFailure }>()
const emit = defineEmits<{ action: [RecoveryAction] }>()
const shown = computed(() => presentFailure(props.failure))
const tone = {
  info: 'border-blue-300 bg-blue-50 text-blue-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
} as const
</script>

<template>
  <div
    :class="['rounded border p-3 text-sm', tone[shown.severity]]"
    :role="shown.severity === 'error' ? 'alert' : 'status'"
  >
    <p>{{ $t(shown.messageKey, shown.params) }}</p>
    <button
      v-if="shown.action !== 'none' && shown.action !== 'wait'"
      type="button"
      class="mt-2 rounded border px-2 py-1 font-medium"
      @click="emit('action', shown.action)"
    >
      {{ $t(`failure.action.${shown.action}`) }}
    </button>
  </div>
</template>
