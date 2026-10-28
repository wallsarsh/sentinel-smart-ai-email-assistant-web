<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DailyBrief } from '#shared/brief'
import { isStale } from '~/utils/catch-up'

const props = defineProps<{ brief: DailyBrief; showStale?: boolean; now?: Date }>()

type Head = { id: string; subject: string; sender: string | null; address: string }
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const stale = computed(
  () => !!props.showStale && isStale(props.brief.createdAt, props.now ?? new Date()),
)
const statKeys = ['total', 'needsReply', 'p1', 'p2', 'newsletters', 'notifications'] as const
const chips = computed(() => statKeys.filter((k) => props.brief.stats[k] > 0))

// An item with several linked mails opens a small list instead of guessing which one to show.
const openKey = ref<string | null>(null)
const heads = ref<Head[]>([])
const loadFailed = ref(false)
async function toggle(key: string, ids: string[]) {
  if (openKey.value === key) {
    openKey.value = null
    return
  }
  openKey.value = key
  heads.value = []
  loadFailed.value = false
  try {
    heads.value = (
      await $fetch<{ heads: Head[] }>('/api/brief/heads', { query: { ids: ids.join(',') } })
    ).heads
  } catch {
    loadFailed.value = true
  }
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="stale" role="status" data-testid="stale" class="rounded border p-3 text-sm">
      {{ $t('brief.stale', { when: when(brief.createdAt) }) }}
    </p>
    <p class="text-sm" style="color: var(--muted)">
      {{ $t('brief.generated', { when: when(brief.createdAt) }) }}
    </p>
    <p class="rounded border p-4 text-lg" data-testid="headline">
      {{ brief.headline || $t('brief.nothingNew') }}
    </p>
    <ul v-if="chips.length" class="flex flex-wrap gap-2" data-testid="stats">
      <li v-for="k in chips" :key="k" class="rounded border px-2 py-0.5 text-sm">
        {{ $t(`brief.stat.${k}`, { n: brief.stats[k] }) }}
      </li>
    </ul>
    <section v-for="s in brief.sections" :key="s.type" :aria-labelledby="`brief-${s.type}`">
      <h2 :id="`brief-${s.type}`" class="font-semibold">{{ $t(`brief.section.${s.type}`) }}</h2>
      <ul class="mt-1 space-y-2">
        <li v-for="(it, i) in s.items" :key="`${s.type}-${i}`" class="rounded border p-3">
          <NuxtLink
            v-if="it.messageIds.length === 1"
            :to="`/inbox/${it.messageIds[0]}`"
            class="underline"
            >{{ it.text }}</NuxtLink
          >
          <template v-else>
            <button
              type="button"
              class="text-left underline"
              :aria-expanded="openKey === `${s.type}-${i}`"
              @click="toggle(`${s.type}-${i}`, it.messageIds)"
            >
              {{ it.text }}
            </button>
            <span class="ml-2 text-sm" style="color: var(--muted)">{{
              $t('brief.linked', { n: it.messageIds.length })
            }}</span>
            <ul v-if="openKey === `${s.type}-${i}`" class="mt-2 space-y-1" data-testid="heads">
              <li v-if="loadFailed" role="alert">{{ $t('failure.network') }}</li>
              <li v-for="h in heads" :key="h.id">
                <NuxtLink :to="`/inbox/${h.id}`" class="underline">{{
                  h.subject || h.sender || h.address
                }}</NuxtLink>
                <span class="text-sm" style="color: var(--muted)">
                  {{ h.sender || h.address }}</span
                >
              </li>
            </ul>
          </template>
        </li>
      </ul>
    </section>
    <p class="text-sm" style="color: var(--muted)">{{ $t('brief.aiNote') }}</p>
  </div>
</template>
