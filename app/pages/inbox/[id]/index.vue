<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'
import type { Detail } from '~/components/message/MessageCard.vue'
import type { Triage } from '~/components/triage/AiCard.vue'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<{
  message: Detail & { threadId: string | null }
  thread: Detail[]
  triage: Triage | null
}>(() => `/api/messages/${id.value}`)

const analyzing = ref(false)
const analyzeFailure = ref<WireFailure | null>(null)
async function analyze() {
  analyzing.value = true
  analyzeFailure.value = null
  try {
    await $fetch(`/api/ai/analyze/${id.value}`, { method: 'POST' })
    await refresh()
  } catch (e) {
    analyzeFailure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? {
      kind: 'network',
    }
  } finally {
    analyzing.value = false
  }
}

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
      <div class="flex flex-wrap gap-2">
        <NuxtLink
          :to="`/inbox/${data.message.id}/reply`"
          class="rounded border px-3 py-1 font-medium"
          data-testid="reply-ai"
          >{{ $t('inbox.replyWithAi') }}</NuxtLink
        >
        <button
          v-if="!data.triage"
          type="button"
          class="rounded border px-3 py-1"
          :disabled="analyzing"
          data-testid="analyze"
          @click="analyze"
        >
          {{ analyzing ? $t('inbox.analyzing') : $t('inbox.analyze') }}
        </button>
      </div>
      <AiSetupBanner />
      <FailureBanner v-if="analyzeFailure" :failure="analyzeFailure" />
      <TriageAiCard
        v-if="data.triage"
        :message-id="data.message.id"
        :triage="data.triage"
        @changed="refresh()"
      />
      <MessageCard
        v-for="m in data.thread"
        :key="m.id"
        :message="m"
        :expanded="m.id === data.message.id"
      />
    </template>
  </section>
</template>
