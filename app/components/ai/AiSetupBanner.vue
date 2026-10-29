<script setup lang="ts">
import { computed, ref } from 'vue'

type Status = {
  providers: number
  hasModel: boolean
  consented: boolean
  models: string[]
  providerId: string | null
}
const { data, refresh } = await useFetch<Status>('/api/ai/status')
const ready = computed(() => !!data.value?.providers && data.value.hasModel && data.value.consented)
const model = ref('')
const busy = ref(false)
const failed = ref(false)

async function saveModel() {
  if (!data.value?.providerId || !model.value.trim()) return
  busy.value = true
  failed.value = false
  try {
    await $fetch('/api/ai/routes', {
      method: 'PUT',
      body: {
        task: 'default',
        chain: [{ providerId: data.value.providerId, model: model.value.trim() }],
      },
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
  <aside v-if="data && !ready" role="status" class="space-y-2 rounded border p-3 text-sm">
    <p class="font-medium">{{ $t('ai.setup.title') }}</p>
    <p v-if="!data.providers">
      <NuxtLink to="/settings/ai" class="underline">{{ $t('ai.setup.noProvider') }}</NuxtLink>
    </p>
    <template v-else>
      <form
        v-if="!data.hasModel"
        class="flex flex-wrap items-end gap-2"
        @submit.prevent="saveModel"
      >
        <div>
          <label for="setup-model" class="block">{{ $t('ai.setup.noModel') }}</label>
          <input
            id="setup-model"
            v-model="model"
            list="setup-models"
            required
            autocomplete="off"
            class="rounded border px-2 py-1"
          />
          <datalist id="setup-models">
            <option v-for="m in data.models" :key="m" :value="m" />
          </datalist>
        </div>
        <button type="submit" :disabled="busy" class="rounded border px-3 py-1 font-medium">
          {{ $t('common.save') }}
        </button>
        <span v-if="failed" role="alert">{{ $t('ai.setup.failed') }}</span>
      </form>
      <p v-if="!data.consented">
        <NuxtLink :to="`/settings/ai/consent?provider=${data.providerId}`" class="underline">{{
          $t('ai.setup.noConsent')
        }}</NuxtLink>
      </p>
    </template>
  </aside>
</template>
