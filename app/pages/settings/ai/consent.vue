<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Provider } from '~/components/ai/ProviderCard.vue'

const route = useRoute()
const { data, refresh } = await useFetch<{ providers: Provider[] }>('/api/ai/providers')
const provider = computed(() => data.value?.providers.find((p) => p.id === route.query.provider))
const host = computed(() => {
  try {
    return new URL(provider.value?.baseUrl ?? '').host
  } catch {
    return ''
  }
})
const busy = ref(false)
const failed = ref(false)

async function set(given: boolean) {
  busy.value = true
  failed.value = false
  try {
    await $fetch(`/api/ai/providers/${provider.value!.id}/consent`, {
      method: 'PUT',
      body: { given },
    })
    await refresh()
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="max-w-2xl space-y-4">
    <NuxtLink to="/settings/ai" class="text-sm underline">{{ $t('ai.title') }}</NuxtLink>
    <template v-if="provider">
      <h1 class="text-2xl font-semibold">
        {{ $t('ai.consent.title', { name: provider.displayName }) }}
      </h1>
      <p>{{ $t('ai.consent.where', { host }) }}</p>
      <h2 class="font-semibold">{{ $t('ai.consent.sentTitle') }}</h2>
      <ul class="list-disc pl-5">
        <li v-for="k in ['sent1', 'sent2', 'sent3']" :key="k">{{ $t(`ai.consent.${k}`) }}</li>
      </ul>
      <h2 class="font-semibold">{{ $t('ai.consent.notTitle') }}</h2>
      <ul class="list-disc pl-5">
        <li v-for="k in ['not1', 'not2', 'not3']" :key="k">{{ $t(`ai.consent.${k}`) }}</li>
      </ul>
      <p class="text-sm" style="color: var(--muted)">{{ $t('ai.consent.control') }}</p>
      <FailureBanner v-if="failed" :failure="{ kind: 'storage' }" />
      <p v-if="provider.consentGivenAt" role="status">
        {{ $t('ai.consent.given', { when: new Date(provider.consentGivenAt).toLocaleString() }) }}
      </p>
      <div class="flex gap-2">
        <button
          v-if="!provider.consentGivenAt"
          type="button"
          :disabled="busy"
          class="rounded border px-3 py-1 font-medium"
          @click="set(true)"
        >
          {{ $t('ai.consent.allow') }}
        </button>
        <button
          v-else
          type="button"
          :disabled="busy"
          class="rounded border px-3 py-1 font-medium"
          @click="set(false)"
        >
          {{ $t('ai.consent.revoke') }}
        </button>
      </div>
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold">{{ $t('ai.consent.noProviderTitle') }}</h1>
      <FailureBanner :failure="{ kind: 'not_found' }" />
    </template>
  </section>
</template>
