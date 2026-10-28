<script setup lang="ts">
import type { DailyBrief } from '#shared/brief'
const route = useRoute()
const { data, error } = await useFetch<{ brief: DailyBrief }>(
  `/api/brief/${String(route.params.id)}`,
)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('nav.brief') }}</h1>
    <FailureBanner v-if="error" :failure="{ kind: 'not_found' }" />
    <BriefBody v-else-if="data" :brief="data.brief" />
    <NuxtLink to="/brief/history" class="underline">{{ $t('brief.history') }}</NuxtLink>
  </section>
</template>
