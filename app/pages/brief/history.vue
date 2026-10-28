<script setup lang="ts">
type Row = { id: string; createdAt: string; headline: string }
const { data, error, refresh } = await useFetch<{ briefs: Row[] }>('/api/brief/history')
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('brief.history') }}</h1>
    <FailureBanner v-if="error" :failure="{ kind: 'network' }" @action="refresh()" />
    <p v-else-if="!data?.briefs.length" style="color: var(--muted)">
      {{ $t('brief.historyEmpty') }}
    </p>
    <ul v-else class="space-y-2">
      <li v-for="b in data.briefs" :key="b.id" class="rounded border p-3">
        <NuxtLink :to="`/brief/${b.id}`" class="font-medium underline">{{
          when(b.createdAt)
        }}</NuxtLink>
        <p class="text-sm" style="color: var(--muted)">
          {{ b.headline || $t('brief.nothingNew') }}
        </p>
      </li>
    </ul>
    <NuxtLink to="/" class="underline">{{ $t('brief.back') }}</NuxtLink>
  </section>
</template>
