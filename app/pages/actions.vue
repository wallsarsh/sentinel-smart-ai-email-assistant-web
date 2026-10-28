<script setup lang="ts">
import { computed } from 'vue'
import type { Item } from '~/components/actions/ActionGroup.vue'

type Groups = Record<'today' | 'upcoming' | 'noDate' | 'snoozed' | 'done', Item[]>
const { data, refresh, error } = await useFetch<{ groups: Groups }>('/api/actions')
const groups = computed(() => data.value?.groups)
const order = ['today', 'upcoming', 'noDate', 'snoozed', 'done'] as const
const total = computed(() => order.reduce((n, k) => n + (groups.value?.[k].length ?? 0), 0))

async function act(path: string, method: 'PUT' | 'POST', body?: object) {
  await $fetch(path, { method, body }).catch(() => undefined)
  await refresh()
}
const done = (i: Item) => act(`/api/actions/${i.id}/status`, 'PUT', { status: 'done' })
const reopen = (i: Item) => act(`/api/actions/${i.id}/status`, 'PUT', { status: 'open' })
const snooze = (i: Item) => act(`/api/actions/${i.id}/snooze`, 'POST')

onMounted(() => {
  useLive().on('triage.done', () => void refresh())
})
</script>

<template>
  <section class="space-y-5">
    <h1 class="text-2xl font-semibold">{{ $t('nav.actions') }}</h1>
    <FailureBanner v-if="error" :failure="{ kind: 'network' }" @action="refresh()" />
    <p v-else-if="!total" class="py-8 text-center" style="color: var(--muted)">
      {{ $t('actions.empty') }}
    </p>
    <ActionsActionGroup
      v-for="k in order"
      :key="k"
      :kind="k"
      :items="groups?.[k] ?? []"
      @done="done"
      @snooze="snooze"
      @reopen="reopen"
    />
  </section>
</template>
