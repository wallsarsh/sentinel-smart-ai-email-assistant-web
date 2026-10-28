<script setup lang="ts">
import { ref } from 'vue'

export type Triage = {
  priority: string
  category: string
  importance: string
  needsReply: boolean
  summary: string
  reason: string
  confidence: number | null
  source: 'ai' | 'rule' | 'user'
}
const props = defineProps<{ messageId: string; triage: Triage }>()
const emit = defineEmits<{ changed: [] }>()
const open = ref(false)
const busy = ref(false)
const failed = ref(false)
const importance = ref(props.triage.importance)

async function save(body: { importance?: string; needsReply?: boolean }) {
  busy.value = true
  failed.value = false
  try {
    await $fetch(`/api/messages/${props.messageId}/triage`, { method: 'PUT', body })
    emit('changed')
    open.value = false
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded border p-3" :aria-label="$t('triage.card.title')">
    <div class="flex flex-wrap items-center gap-2">
      <TriagePriorityChip :priority="triage.priority" />
      <span class="rounded border px-1.5 text-xs">{{
        $t(`triage.category.${triage.category}`)
      }}</span>
      <span v-if="triage.needsReply" class="rounded border px-1.5 text-xs">{{
        $t('inbox.needsReply')
      }}</span>
      <span v-if="triage.source === 'user'" class="text-xs" style="color: var(--muted)">{{
        $t('triage.card.byYou')
      }}</span>
      <button
        type="button"
        class="ml-auto rounded border px-2 py-0.5 text-xs"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ $t('triage.card.correct') }}
      </button>
    </div>
    <p v-if="triage.summary" class="mt-2">{{ triage.summary }}</p>
    <p v-if="triage.reason" class="text-sm" style="color: var(--muted)">
      {{ $t('triage.card.why', { reason: triage.reason }) }}
    </p>
    <p class="mt-1 text-xs" style="color: var(--muted)">
      {{ triage.source === 'rule' ? $t('triage.card.byRule') : $t('triage.card.mistakes') }}
    </p>
    <form
      v-if="open"
      class="mt-3 grid gap-2 border-t pt-3 md:grid-cols-3"
      @submit.prevent="save({ importance, needsReply: triage.needsReply })"
    >
      <div>
        <label for="corr-importance" class="block text-sm">{{
          $t('triage.card.importance')
        }}</label>
        <select id="corr-importance" v-model="importance" class="w-full rounded border px-2 py-1">
          <option v-for="i in ['high', 'medium', 'low']" :key="i" :value="i">
            {{ $t(`triage.importance.${i}`) }}
          </option>
        </select>
      </div>
      <p class="self-end text-xs md:col-span-2" style="color: var(--muted)">
        {{ $t('triage.card.remember') }}
      </p>
      <div class="flex gap-2 md:col-span-3">
        <button type="submit" :disabled="busy" class="rounded border px-3 py-1 text-sm font-medium">
          {{ $t('common.save') }}
        </button>
        <button
          type="button"
          :disabled="busy"
          class="rounded border px-3 py-1 text-sm"
          @click="save({ needsReply: !triage.needsReply })"
        >
          {{ triage.needsReply ? $t('triage.card.noReply') : $t('triage.card.needsReply') }}
        </button>
      </div>
      <p v-if="failed" role="alert" class="text-sm md:col-span-3">{{ $t('failure.storage') }}</p>
    </form>
  </section>
</template>
