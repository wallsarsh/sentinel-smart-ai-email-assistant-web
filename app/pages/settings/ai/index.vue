<script setup lang="ts">
import { ref } from 'vue'
import type { Preset } from '~/components/ai/ProviderForm.vue'
import type { Provider } from '~/components/ai/ProviderCard.vue'

const { data, refresh } = await useFetch<{ providers: Provider[]; presets: Preset[] }>(
  '/api/ai/providers',
)
const adding = ref(false)
function onAdded() {
  adding.value = false
  void refresh()
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('ai.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('ai.intro') }}</p>
    <nav class="flex gap-3 text-sm" :aria-label="$t('ai.title')">
      <NuxtLink to="/settings/ai/routes" class="underline">{{ $t('ai.routes.title') }}</NuxtLink>
      <NuxtLink to="/settings/usage" class="underline">{{ $t('ai.usage.title') }}</NuxtLink>
      <NuxtLink to="/settings/ai/bench" class="underline">{{ $t('ai.bench.title') }}</NuxtLink>
    </nav>
    <p v-if="!data?.providers.length">{{ $t('ai.providers.empty') }}</p>
    <AiProviderCard
      v-for="p in data?.providers ?? []"
      :key="p.id"
      :provider="p"
      @changed="refresh()"
    />
    <button
      v-if="!adding"
      type="button"
      class="rounded border px-3 py-1 font-medium"
      @click="adding = true"
    >
      {{ $t('ai.providers.add') }}
    </button>
    <AiProviderForm
      v-else
      :presets="data?.presets ?? []"
      @added="onAdded"
      @cancel="adding = false"
    />
  </section>
</template>
