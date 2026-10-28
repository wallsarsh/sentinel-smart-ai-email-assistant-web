<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DailyBrief } from '#shared/brief'
import type { WireFailure } from '~/utils/failure-presenter'
import {
  CATCH_UP_PRESETS,
  fromLocalInput,
  presetStart,
  toLocalInput,
  validRange,
  type CatchUpPreset,
} from '~/utils/catch-up'

const now = () => new Date()
const from = ref(toLocalInput(presetStart('today', now())))
const to = ref(toLocalInput(now()))
const busy = ref(false)
const result = ref<DailyBrief | null>(null)
const failure = ref<WireFailure | null>(null)
const valid = computed(() =>
  validRange(fromLocalInput(from.value), fromLocalInput(to.value), now()),
)
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

function choose(p: CatchUpPreset) {
  from.value = toLocalInput(presetStart(p, now()))
  to.value = toLocalInput(now())
  result.value = null
}

async function run() {
  if (!valid.value || busy.value) return
  busy.value = true
  failure.value = null
  result.value = null
  try {
    result.value = (
      await $fetch<{ brief: DailyBrief }>('/api/brief/catch-up', {
        method: 'POST',
        body: {
          from: fromLocalInput(from.value).toISOString(),
          to: fromLocalInput(to.value).toISOString(),
        },
      })
    ).brief
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('brief.catch.title') }}</h1>
    <p style="color: var(--muted)">{{ $t('brief.catch.intro') }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in CATCH_UP_PRESETS"
        :key="p"
        type="button"
        class="rounded border px-3 py-1"
        @click="choose(p)"
      >
        {{ $t(`brief.catch.preset.${p}`) }}
      </button>
    </div>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="run">
      <label class="flex flex-col text-sm"
        >{{ $t('brief.catch.from') }}
        <input v-model="from" type="datetime-local" class="rounded border px-2 py-1" >
      </label>
      <label class="flex flex-col text-sm"
        >{{ $t('brief.catch.to') }}
        <input v-model="to" type="datetime-local" class="rounded border px-2 py-1" >
      </label>
      <button
        type="submit"
        class="rounded border px-4 py-1"
        :disabled="!valid || busy"
        data-testid="run"
      >
        {{ $t('brief.catch.run') }}
      </button>
    </form>
    <p v-if="!valid" role="status" class="text-sm">{{ $t('brief.catch.invalid') }}</p>
    <FailureBanner v-if="failure" :failure="failure" @action="run" />
    <BriefSkeleton v-if="busy" />
    <div v-else-if="result" class="space-y-2">
      <h2 class="font-semibold">
        {{
          $t('brief.catch.result', { from: when(result.windowStart), to: when(result.windowEnd) })
        }}
      </h2>
      <BriefBody :brief="result" />
      <p class="text-sm" style="color: var(--muted)">{{ $t('brief.catch.notSaved') }}</p>
    </div>
    <NuxtLink to="/" class="underline">{{ $t('brief.back') }}</NuxtLink>
  </section>
</template>
