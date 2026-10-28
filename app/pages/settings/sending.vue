<script setup lang="ts">
import { computed, ref } from 'vue'

type Settings = {
  'send.undoSeconds': number
  'send.requireStepUp': boolean
  'send.blockOnPlaceholders': boolean
  'send.warnExternalRecipients': boolean
  'send.dailyLimit': number
}
type Rec = {
  id: string
  account: string
  status: string
  approvedAt: string
  sentAt: string | null
  recipientCount: number
  errorCode: string | null
}
const { data: s } = await useFetch<Settings>('/api/settings')
const { data: log, refresh } = await useFetch<{ records: Rec[] }>('/api/send/log')
const form = ref({
  undo: s.value?.['send.undoSeconds'] ?? 5,
  stepUp: s.value?.['send.requireStepUp'] ?? true,
  placeholders: s.value?.['send.blockOnPlaceholders'] ?? true,
  external: s.value?.['send.warnExternalRecipients'] ?? true,
  limit: s.value?.['send.dailyLimit'] ?? 50,
})
const state = ref<'idle' | 'saved' | 'error'>('idle')
const checked = ref<string>('')
const hasUnknown = computed(() => (log.value?.records ?? []).some((r) => r.status === 'unknown'))

async function save() {
  state.value = 'idle'
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        'send.undoSeconds': Math.min(30, Math.max(0, Math.round(form.value.undo))),
        'send.requireStepUp': form.value.stepUp,
        'send.blockOnPlaceholders': form.value.placeholders,
        'send.warnExternalRecipients': form.value.external,
        'send.dailyLimit': Math.max(0, Math.round(form.value.limit)),
      },
    })
    state.value = 'saved'
  } catch {
    state.value = 'error'
  }
}
async function reconcile() {
  const r = await $fetch<{ checked: number; found: number }>('/api/send/reconcile', {
    method: 'POST',
  }).catch(() => null)
  checked.value = r ? `${r.found}/${r.checked}` : ''
  await refresh()
}
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="max-w-3xl space-y-5">
    <h1 class="text-2xl font-semibold">{{ $t('sending.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('sending.intro') }}</p>
    <form class="grid gap-3 md:grid-cols-2" @submit.prevent="save">
      <div>
        <label for="s-undo" class="block text-sm font-medium">{{ $t('sending.undo') }}</label>
        <input
          id="s-undo"
          v-model.number="form.undo"
          type="number"
          min="0"
          max="30"
          class="w-full rounded border px-2 py-1"
        >
        <p class="text-xs" style="color: var(--muted)">{{ $t('sending.undoHint') }}</p>
      </div>
      <div>
        <label for="s-limit" class="block text-sm font-medium">{{ $t('sending.limit') }}</label>
        <input
          id="s-limit"
          v-model.number="form.limit"
          type="number"
          min="0"
          max="1000"
          class="w-full rounded border px-2 py-1"
        >
        <p class="text-xs" style="color: var(--muted)">{{ $t('sending.limitHint') }}</p>
      </div>
      <label class="flex items-start gap-2 text-sm md:col-span-2"
        ><input v-model="form.stepUp" type="checkbox" class="mt-1" >{{
          $t('sending.stepUp')
        }}</label
      >
      <label class="flex items-start gap-2 text-sm md:col-span-2"
        ><input v-model="form.placeholders" type="checkbox" class="mt-1" >{{
          $t('sending.placeholders')
        }}</label
      >
      <label class="flex items-start gap-2 text-sm md:col-span-2"
        ><input v-model="form.external" type="checkbox" class="mt-1" >{{
          $t('sending.external')
        }}</label
      >
      <div class="flex items-center gap-3 md:col-span-2">
        <button type="submit" class="rounded border px-3 py-1 font-medium">
          {{ $t('common.save') }}
        </button>
        <span v-if="state === 'saved'" role="status" class="text-sm">{{
          $t('ai.routes.saved')
        }}</span>
        <span v-if="state === 'error'" role="alert" class="text-sm">{{
          $t('failure.validation.generic')
        }}</span>
      </div>
    </form>

    <section :aria-labelledby="'sent-log'">
      <div class="flex items-center gap-3">
        <h2 id="sent-log" class="font-semibold">{{ $t('sending.log') }}</h2>
        <button
          v-if="hasUnknown"
          type="button"
          class="ml-auto rounded border px-2 py-1 text-sm"
          @click="reconcile"
        >
          {{ $t('sending.checkUnknown') }}
        </button>
        <span v-if="checked" role="status" class="text-sm">{{
          $t('sending.checked', { n: checked })
        }}</span>
      </div>
      <p class="text-sm" style="color: var(--muted)">{{ $t('sending.logHint') }}</p>
      <p v-if="!log?.records.length" class="py-4 text-center" style="color: var(--muted)">
        {{ $t('sending.logEmpty') }}
      </p>
      <table v-else class="mt-2 w-full text-sm">
        <caption class="sr-only">
          {{
            $t('sending.log')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="text-left">{{ $t('sending.when') }}</th>
            <th scope="col" class="text-left">{{ $t('sending.account') }}</th>
            <th scope="col" class="text-right">{{ $t('sending.recipients') }}</th>
            <th scope="col" class="text-left">{{ $t('sending.result') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in log.records" :key="r.id">
            <th scope="row" class="text-left font-normal">{{ when(r.sentAt ?? r.approvedAt) }}</th>
            <td>{{ r.account }}</td>
            <td class="text-right">{{ r.recipientCount }}</td>
            <td>{{ $t(`sending.status.${r.status}`) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
