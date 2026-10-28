<script setup lang="ts">
import type { Provider } from '~/components/ai/ProviderCard.vue'
import type { RouteRow } from '~/components/ai/RouteEditor.vue'

type Stored = {
  task: string
  position: number
  providerId: string
  model: string
  paramsJson: RouteRow['params']
}
const [{ data: provs }, { data: routes }] = await Promise.all([
  useFetch<{ providers: Provider[] }>('/api/ai/providers'),
  useFetch<{ routes: Stored[] }>('/api/ai/routes'),
])
const tasks = ['default', 'triage', 'brief', 'draft', 'repair']
const chain = (t: string): RouteRow[] =>
  (routes.value?.routes ?? [])
    .filter((r) => r.task === t)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ providerId: r.providerId, model: r.model, params: r.paramsJson ?? {} }))
</script>

<template>
  <section class="space-y-4">
    <NuxtLink to="/settings/ai" class="text-sm underline">{{ $t('ai.title') }}</NuxtLink>
    <h1 class="text-2xl font-semibold">{{ $t('ai.routes.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('ai.routes.intro') }}</p>
    <p v-if="!provs?.providers.length">{{ $t('ai.providers.empty') }}</p>
    <AiRouteEditor
      v-for="t in tasks"
      :key="t"
      :task="t"
      :providers="provs?.providers ?? []"
      :model-value="chain(t)"
    />
  </section>
</template>
