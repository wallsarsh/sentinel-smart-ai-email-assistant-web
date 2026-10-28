<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '~/utils/failure-presenter'

type Rule = { id: string; pattern: string; kind: 'vip' | 'mute'; accountId: string | null }
const { data, refresh } = await useFetch<{ rules: Rule[] }>('/api/rules')
const pattern = ref('')
const kind = ref<'vip' | 'mute'>('vip')
const failure = ref<WireFailure | null>(null)

async function add() {
  failure.value = null
  try {
    await $fetch('/api/rules', {
      method: 'POST',
      body: { kind: kind.value, pattern: pattern.value },
    })
    pattern.value = ''
    await refresh()
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  }
}
async function remove(r: Rule) {
  await $fetch(`/api/rules/${r.id}`, { method: 'DELETE' }).catch(() => undefined)
  await refresh()
}
const of = (k: 'vip' | 'mute') => (data.value?.rules ?? []).filter((r) => r.kind === k)
</script>

<template>
  <section class="max-w-2xl space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('triage.senders.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('triage.senders.intro') }}</p>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="add">
      <div class="grow">
        <label for="rule-pattern" class="block text-sm font-medium">{{
          $t('triage.senders.pattern')
        }}</label>
        <input
          id="rule-pattern"
          v-model="pattern"
          required
          placeholder="boss@corp.example or @news.example"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="rule-kind" class="block text-sm font-medium">{{
          $t('triage.senders.kind')
        }}</label>
        <select id="rule-kind" v-model="kind" class="rounded border px-2 py-1">
          <option value="vip">{{ $t('triage.senders.vip') }}</option>
          <option value="mute">{{ $t('triage.senders.mute') }}</option>
        </select>
      </div>
      <button type="submit" class="rounded border px-3 py-1 font-medium">
        {{ $t('triage.senders.add') }}
      </button>
    </form>
    <FailureBanner v-if="failure" :failure="failure" />
    <section
      v-for="k in ['vip', 'mute'] as const"
      :key="k"
      :aria-label="$t(`triage.senders.${k}s`)"
    >
      <h2 class="font-semibold">{{ $t(`triage.senders.${k}s`) }}</h2>
      <p v-if="!of(k).length" class="text-sm" style="color: var(--muted)">
        {{ $t('triage.senders.none') }}
      </p>
      <ul class="space-y-1">
        <li v-for="r in of(k)" :key="r.id" class="flex items-center gap-2 rounded border px-2 py-1">
          <span class="break-all">{{ r.pattern }}</span>
          <button
            type="button"
            class="ml-auto rounded border px-2 text-sm"
            :aria-label="$t('triage.senders.removeFor', { pattern: r.pattern })"
            @click="remove(r)"
          >
            {{ $t('accounts.remove') }}
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>
