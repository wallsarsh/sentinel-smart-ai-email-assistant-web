<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Provider } from '~/components/ai/ProviderCard.vue'
import { usd } from '~/utils/usage'
import type { WireFailure } from '~/utils/failure-presenter'

type Side = {
  ok: boolean
  failure?: WireFailure
  validJson?: boolean
  errors?: string[]
  tokens?: { input: number; output: number; cached: number }
  latencyMs: number
  costMicros?: number
  unpriced?: boolean
}
const { data } = await useFetch<{ providers: Provider[] }>('/api/ai/providers')
const providers = computed(() => data.value?.providers ?? [])
const sel = ref({ a: { providerId: '', model: '' }, b: { providerId: '', model: '' } })
const result = ref<{ a: Side; b: Side } | null>(null)
const busy = ref(false)
const failure = ref<WireFailure | null>(null)
const tokensText = (s: Side) => (s.tokens ? `${s.tokens.input} / ${s.tokens.output}` : '')
const costText = (s: Side) => (s.ok ? usd(s.costMicros ?? 0) : '')
const modelsFor = (id: string) => providers.value.find((p) => p.id === id)?.models ?? []

async function run() {
  busy.value = true
  failure.value = null
  result.value = null
  try {
    result.value = await $fetch('/api/ai/bench', { method: 'POST', body: sel.value })
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <NuxtLink to="/settings/ai" class="text-sm underline">{{ $t('ai.title') }}</NuxtLink>
    <h1 class="text-2xl font-semibold">{{ $t('ai.bench.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('ai.bench.intro') }}</p>
    <FailureBanner v-if="failure" :failure="failure" />
    <form class="grid gap-4 md:grid-cols-2" @submit.prevent="run">
      <fieldset v-for="side in ['a', 'b'] as const" :key="side" class="rounded border p-3">
        <legend class="px-1 font-semibold">{{ $t(`ai.bench.side.${side}`) }}</legend>
        <label :for="`bench-p-${side}`" class="block text-sm">{{ $t('ai.routes.provider') }}</label>
        <select
          :id="`bench-p-${side}`"
          v-model="sel[side].providerId"
          required
          class="w-full rounded border px-2 py-1"
        >
          <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.displayName }}</option>
        </select>
        <label :for="`bench-m-${side}`" class="mt-2 block text-sm">{{
          $t('ai.routes.model')
        }}</label>
        <input
          :id="`bench-m-${side}`"
          v-model="sel[side].model"
          :list="`bench-models-${side}`"
          required
          class="w-full rounded border px-2 py-1"
        />
        <datalist :id="`bench-models-${side}`">
          <option v-for="m in modelsFor(sel[side].providerId)" :key="m" :value="m" />
        </datalist>
      </fieldset>
      <div class="md:col-span-2">
        <button type="submit" :disabled="busy" class="rounded border px-3 py-1 font-medium">
          {{ $t('ai.bench.run') }}
        </button>
      </div>
    </form>
    <table v-if="result" class="w-full text-sm">
      <caption class="sr-only">
        {{
          $t('ai.bench.title')
        }}
      </caption>
      <thead>
        <tr>
          <td />
          <th scope="col" class="text-left">{{ $t('ai.bench.side.a') }}</th>
          <th scope="col" class="text-left">{{ $t('ai.bench.side.b') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ['result', 'tokens', 'latency', 'cost']" :key="row">
          <th scope="row" class="text-left">{{ $t(`ai.bench.row.${row}`) }}</th>
          <td v-for="side in ['a', 'b'] as const" :key="side">
            <template v-if="row === 'result'">{{
              result[side].ok
                ? result[side].validJson
                  ? $t('ai.bench.valid')
                  : $t('ai.bench.invalid')
                : $t('failure.unknown')
            }}</template>
            <template v-else-if="row === 'tokens'">{{ tokensText(result[side]) }}</template>
            <template v-else-if="row === 'latency'">{{ `${result[side].latencyMs} ms` }}</template>
            <template v-else
              >{{ costText(result[side])
              }}<span v-if="result[side].unpriced" class="ml-1 rounded border px-1 text-xs">{{
                $t('ai.usage.unpriced')
              }}</span></template
            >
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
