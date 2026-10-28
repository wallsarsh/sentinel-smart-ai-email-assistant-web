<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const online = ref(true)
const set = () => (online.value = navigator.onLine)
onMounted(() => {
  set()
  window.addEventListener('online', set)
  window.addEventListener('offline', set)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', set)
  window.removeEventListener('offline', set)
})
</script>

<template>
  <p
    v-if="!online"
    role="status"
    class="border-b p-2 text-center text-sm"
    data-testid="offline-banner"
  >
    {{ $t('offline.banner') }}
  </p>
</template>
