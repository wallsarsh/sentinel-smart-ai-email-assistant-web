<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { DailyBrief } from '#shared/brief'
import type { RecoveryAction, WireFailure } from '~/utils/failure-presenter'
import { briefActionTarget } from '~/utils/brief-action'

const brief = ref<DailyBrief | null>(null)
const loading = ref(true)
const generating = ref(false)
const failure = ref<WireFailure | null>(null)

async function load() {
  try {
    brief.value = (await $fetch<{ brief: DailyBrief | null }>('/api/brief')).brief
  } catch {
    failure.value = { kind: 'network' }
  } finally {
    loading.value = false
  }
}

async function generate() {
  if (generating.value) return
  generating.value = true
  failure.value = null
  try {
    brief.value = (await $fetch<{ brief: DailyBrief }>('/api/brief', { method: 'POST' })).brief
  } catch (e) {
    const wire = (e as { data?: { error?: WireFailure } }).data?.error
    failure.value = wire ?? { kind: 'network' }
  } finally {
    generating.value = false
  }
}

function onAction(a: RecoveryAction) {
  const to = briefActionTarget(a)
  if (to) void navigateTo(to)
  else void generate()
}
onMounted(load)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-2xl font-semibold">{{ $t('nav.brief') }}</h1>
      <button
        type="button"
        class="rounded border px-3 py-1"
        :disabled="generating"
        data-testid="refresh"
        @click="generate"
      >
        {{ $t('brief.refresh') }}
      </button>
      <NuxtLink to="/brief/catch-up" class="rounded border px-3 py-1">{{
        $t('brief.catchUp')
      }}</NuxtLink>
      <NuxtLink to="/brief/history" class="rounded border px-3 py-1">{{
        $t('brief.history')
      }}</NuxtLink>
    </div>
    <FailureBanner v-if="failure" :failure="failure" @action="onAction" />
    <BriefSkeleton v-if="loading || generating" />
    <BriefBody v-else-if="brief" :brief="brief" show-stale />
    <div v-else class="py-10 text-center">
      <p class="text-lg font-medium">{{ $t('brief.emptyTitle') }}</p>
      <p class="mt-2" style="color: var(--muted)">{{ $t('brief.emptyBody') }}</p>
      <button
        type="button"
        class="mt-4 rounded border px-4 py-2"
        data-testid="generate"
        @click="generate"
      >
        {{ $t('brief.generate') }}
      </button>
    </div>
  </section>
</template>
