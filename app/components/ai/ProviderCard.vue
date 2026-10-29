<script setup lang="ts">
import { ref } from 'vue'
import type { WireFailure } from '../../utils/failure-presenter'

export type Provider = {
  id: string
  kind: string
  displayName: string
  baseUrl: string
  status: string
  consentGivenAt: string | null
  models: string[]
  keyHint: string
}
const props = defineProps<{ provider: Provider }>()
const emit = defineEmits<{ changed: [] }>()

const newKey = ref('')
const replacing = ref(false)
const failure = ref<WireFailure | null>(null)
const note = ref('')

const wire = (e: unknown): WireFailure =>
  (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }

async function test() {
  failure.value = null
  try {
    const r = await $fetch<{ models: string[] }>(`/api/ai/providers/${props.provider.id}/test`, {
      method: 'POST',
    })
    note.value = String(r.models.length)
    emit('changed')
  } catch (e) {
    failure.value = wire(e)
    emit('changed')
  }
}
async function replaceKey() {
  failure.value = null
  try {
    await $fetch(`/api/ai/providers/${props.provider.id}/key`, {
      method: 'PUT',
      body: { apiKey: newKey.value },
    })
    newKey.value = ''
    replacing.value = false
    emit('changed')
  } catch (e) {
    failure.value = wire(e)
  }
}
async function remove() {
  if (!confirm(props.provider.displayName)) return
  await $fetch(`/api/ai/providers/${props.provider.id}`, { method: 'DELETE' }).catch(
    (e) => (failure.value = wire(e)),
  )
  emit('changed')
}
</script>

<template>
  <article class="rounded border p-3">
    <div class="flex flex-wrap items-center gap-2">
      <strong>{{ provider.displayName }}</strong>
      <span class="rounded border px-1 text-xs">{{
        $t(
          `ai.providers.status.${['ok', 'bad_key', 'unreachable'].includes(provider.status) ? provider.status : 'ok'}`,
        )
      }}</span>
      <span class="text-sm" style="color: var(--muted)">{{
        $t('ai.providers.keyEnding', { hint: provider.keyHint })
      }}</span>
      <span class="ml-auto text-sm">{{
        $t('ai.providers.models', { n: provider.models.length })
      }}</span>
    </div>
    <FailureBanner v-if="failure" :failure="failure" class="mt-2" />
    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button" class="rounded border px-2 py-1 text-sm" @click="test">
        {{ $t('ai.providers.test') }}
      </button>
      <button
        type="button"
        class="rounded border px-2 py-1 text-sm"
        @click="replacing = !replacing"
      >
        {{ $t('ai.providers.replaceKey') }}
      </button>
      <NuxtLink
        :to="`/settings/ai/consent?provider=${provider.id}`"
        class="rounded border px-2 py-1 text-sm"
      >
        {{ provider.consentGivenAt ? $t('ai.consent.manage') : $t('ai.consent.review') }}
      </NuxtLink>
      <button type="button" class="rounded border px-2 py-1 text-sm" @click="remove">
        {{ $t('accounts.remove') }}
      </button>
    </div>
    <form v-if="replacing" class="mt-2 flex items-end gap-2" @submit.prevent="replaceKey">
      <div class="grow">
        <label :for="`key-${provider.id}`" class="block text-sm">{{
          $t('ai.providers.newKey')
        }}</label>
        <input
          :id="`key-${provider.id}`"
          v-model="newKey"
          type="password"
          autocomplete="off"
          required
          minlength="8"
          class="w-full rounded border px-2 py-1"
        />
      </div>
      <button type="submit" class="rounded border px-3 py-1">{{ $t('common.save') }}</button>
    </form>
  </article>
</template>
