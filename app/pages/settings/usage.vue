<script setup lang="ts">
import { computed, ref } from 'vue'
import { byDay, byModel, usd, type UsageRow } from '~/utils/usage'

type Usage = {
  rows: UsageRow[]
  today: { tokens: number; costMicros: number }
  caps: { tokens: number; costMicros: number }
  prices: Record<string, { in: number; out: number }>
}
const days = 30
const { data, refresh } = await useFetch<Usage>('/api/ai/usage', { query: { days } })
const daily = computed(() => byDay(data.value?.rows ?? [], days, new Date()))
const models = computed(() => byModel(data.value?.rows ?? [], data.value?.prices ?? {}))
const maxTokens = computed(() => Math.max(1, ...daily.value.map((d) => d.tokens)))

const tokenCap = ref(data.value?.caps.tokens ?? 0)
const costCap = ref((data.value?.caps.costMicros ?? 0) / 1_000_000)
const msg = ref('')
async function saveCaps() {
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        'ai.dailyTokenCap': Math.max(0, Math.round(tokenCap.value || 0)),
        'ai.dailyCostCapMicros': Math.max(0, Math.round((costCap.value || 0) * 1_000_000)),
      },
    })
    msg.value = 'saved'
    await refresh()
  } catch {
    msg.value = 'error'
  }
}
const prices = ref<Record<string, { in: number | null; out: number | null }>>({})
async function savePrice(model: string) {
  const p = prices.value[model]
  if (!p || p.in === null || p.out === null) return
  await $fetch('/api/ai/prices', {
    method: 'PUT',
    body: { model, price: { in: p.in, out: p.out } },
  })
  await refresh()
}
</script>

<template>
  <section class="space-y-5">
    <NuxtLink to="/settings/ai" class="text-sm underline">{{ $t('ai.title') }}</NuxtLink>
    <h1 class="text-2xl font-semibold">{{ $t('ai.usage.title') }}</h1>

    <div role="group" :aria-label="$t('ai.usage.today')" class="rounded border p-3">
      <h2 class="font-semibold">{{ $t('ai.usage.today') }}</h2>
      <p>
        {{
          $t('ai.usage.todayLine', {
            tokens: data?.today.tokens ?? 0,
            cost: usd(data?.today.costMicros ?? 0),
          })
        }}
      </p>
    </div>

    <form class="grid gap-3 rounded border p-3 md:grid-cols-3" @submit.prevent="saveCaps">
      <h2 class="font-semibold md:col-span-3">{{ $t('ai.usage.caps') }}</h2>
      <div>
        <label for="cap-tokens" class="block text-sm">{{ $t('ai.usage.tokenCap') }}</label
        ><input
          id="cap-tokens"
          v-model.number="tokenCap"
          type="number"
          min="0"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="cap-cost" class="block text-sm">{{ $t('ai.usage.costCap') }}</label
        ><input
          id="cap-cost"
          v-model.number="costCap"
          type="number"
          min="0"
          step="0.01"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div class="flex items-end gap-2">
        <button type="submit" class="rounded border px-3 py-1">{{ $t('common.save') }}</button
        ><span v-if="msg" role="status" class="text-sm">{{
          msg === 'saved' ? $t('ai.routes.saved') : $t('failure.storage')
        }}</span>
      </div>
      <p class="text-xs md:col-span-3" style="color: var(--muted)">{{ $t('ai.usage.capHint') }}</p>
    </form>

    <section>
      <h2 class="font-semibold">{{ $t('ai.usage.perDay') }}</h2>
      <svg
        :viewBox="`0 0 ${daily.length * 10} 60`"
        class="h-24 w-full"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
      >
        <rect
          v-for="(d, i) in daily"
          :key="d.day"
          :x="i * 10 + 1"
          :y="60 - (d.tokens / maxTokens) * 58"
          width="8"
          :height="(d.tokens / maxTokens) * 58"
          fill="currentColor"
        />
      </svg>
      <table class="mt-2 w-full text-sm">
        <caption class="sr-only">
          {{
            $t('ai.usage.perDay')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="text-left">{{ $t('ai.usage.day') }}</th>
            <th scope="col" class="text-right">{{ $t('ai.usage.tokens') }}</th>
            <th scope="col" class="text-right">{{ $t('ai.usage.cost') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in daily.filter((x) => x.calls).reverse()" :key="d.day">
            <th scope="row" class="text-left font-normal">{{ d.day }}</th>
            <td class="text-right">{{ d.tokens }}</td>
            <td class="text-right">{{ usd(d.costMicros) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2 class="font-semibold">{{ $t('ai.usage.perModel') }}</h2>
      <p class="text-sm" style="color: var(--muted)">{{ $t('ai.usage.priceHint') }}</p>
      <table class="mt-2 w-full text-sm">
        <caption class="sr-only">
          {{
            $t('ai.usage.perModel')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="text-left">{{ $t('ai.routes.model') }}</th>
            <th scope="col" class="text-right">{{ $t('ai.usage.tokens') }}</th>
            <th scope="col" class="text-right">{{ $t('ai.usage.cost') }}</th>
            <th scope="col" class="text-left">{{ $t('ai.usage.price') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in models" :key="m.model">
            <th scope="row" class="text-left font-normal">{{ m.model }}</th>
            <td class="text-right">{{ m.tokens }}</td>
            <td class="text-right">
              {{ usd(m.costMicros)
              }}<span v-if="m.unpriced" class="ml-1 rounded border px-1 text-xs">{{
                $t('ai.usage.unpriced')
              }}</span>
            </td>
            <td>
              <form class="flex items-end gap-1" @submit.prevent="savePrice(m.model)">
                <label :for="`pin-${m.model}`" class="sr-only">{{ $t('ai.usage.priceIn') }}</label>
                <input
                  :id="`pin-${m.model}`"
                  v-model.number="
                    (prices[m.model] ??= {
                      in: data?.prices[m.model]?.in ?? null,
                      out: data?.prices[m.model]?.out ?? null,
                    }).in
                  "
                  type="number"
                  min="0"
                  step="0.01"
                  :placeholder="$t('ai.usage.priceIn')"
                  class="w-20 rounded border px-1"
                >
                <label :for="`pout-${m.model}`" class="sr-only">{{
                  $t('ai.usage.priceOut')
                }}</label>
                <input
                  :id="`pout-${m.model}`"
                  v-model.number="prices[m.model]!.out"
                  type="number"
                  min="0"
                  step="0.01"
                  :placeholder="$t('ai.usage.priceOut')"
                  class="w-20 rounded border px-1"
                >
                <button type="submit" class="rounded border px-2 text-xs">
                  {{ $t('common.save') }}
                </button>
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
