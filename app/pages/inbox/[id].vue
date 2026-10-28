<script setup lang="ts">
import { computed } from 'vue'
import type { Detail } from '~/components/message/MessageCard.vue'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error } = await useFetch<{
  message: Detail & { threadId: string | null }
  thread: Detail[]
}>(() => `/api/messages/${id.value}`)

onMounted(async () => {
  if (data.value)
    await $fetch(`/api/messages/${id.value}/read`, { method: 'PUT', body: { isRead: true } }).catch(
      () => undefined,
    )
})
</script>

<template>
  <section class="space-y-3">
    <NuxtLink to="/inbox" class="text-sm underline">{{ '← ' + $t('nav.inbox') }}</NuxtLink>
    <FailureBanner v-if="error" :failure="{ kind: 'not_found' }" />
    <template v-else-if="data">
      <h1 class="text-xl font-semibold">{{ data.message.subject || $t('inbox.noSubject') }}</h1>
      <!-- Slot for the AI summary card (T094) -->
      <slot name="ai" :message="data.message" />
      <MessageCard
        v-for="m in data.thread"
        :key="m.id"
        :message="m"
        :expanded="m.id === data.message.id"
      />
    </template>
  </section>
</template>
