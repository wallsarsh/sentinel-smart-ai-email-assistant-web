<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WireFailure } from '../../utils/failure-presenter'

export type Preset = {
  id: string
  kind: string
  name: string
  baseUrl: string
  editableUrl: boolean
}
const props = defineProps<{ presets: Preset[] }>()
const emit = defineEmits<{ added: []; cancel: [] }>()

const presetId = ref(props.presets[0]?.id ?? '')
const preset = computed(() => props.presets.find((p) => p.id === presetId.value))
const name = ref('')
const baseUrl = ref('')
const apiKey = ref('')
const model = ref('')
const busy = ref(false)
const failure = ref<WireFailure | null>(null)

async function save() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/ai/providers', {
      method: 'POST',
      body: {
        presetId: presetId.value,
        displayName: name.value || undefined,
        baseUrl: preset.value?.editableUrl ? baseUrl.value : undefined,
        apiKey: apiKey.value,
        model: model.value.trim() || undefined,
      },
    })
    apiKey.value = '' // the key is never kept in the page after submitting
    emit('added')
  } catch (e) {
    failure.value = (e as { data?: { error?: WireFailure } }).data?.error ?? { kind: 'network' }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="save">
    <h2 class="text-lg font-semibold">{{ $t('ai.providers.add') }}</h2>
    <FailureBanner v-if="failure" :failure="failure" />
    <div>
      <label for="prov-preset" class="block text-sm font-medium">{{
        $t('ai.providers.type')
      }}</label>
      <select id="prov-preset" v-model="presetId" class="mt-1 w-full rounded border px-2 py-1">
        <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <div>
      <label for="prov-name" class="block text-sm font-medium">{{ $t('ai.providers.name') }}</label>
      <input
        id="prov-name"
        v-model="name"
        maxlength="60"
        class="mt-1 w-full rounded border px-2 py-1"
      />
    </div>
    <div v-if="preset?.editableUrl">
      <label for="prov-url" class="block text-sm font-medium">{{
        $t('ai.providers.baseUrl')
      }}</label>
      <input
        id="prov-url"
        v-model="baseUrl"
        type="url"
        required
        placeholder="https://"
        class="mt-1 w-full rounded border px-2 py-1"
      />
      <p class="text-xs" style="color: var(--muted)">{{ $t('ai.providers.baseUrlHint') }}</p>
    </div>
    <div>
      <label for="prov-key" class="block text-sm font-medium">{{ $t('ai.providers.key') }}</label>
      <input
        id="prov-key"
        v-model="apiKey"
        type="password"
        autocomplete="off"
        required
        minlength="8"
        class="mt-1 w-full rounded border px-2 py-1"
      />
      <p class="text-xs" style="color: var(--muted)">{{ $t('ai.providers.keyHint') }}</p>
    </div>
    <div>
      <label for="prov-model" class="block text-sm font-medium">{{
        $t('ai.providers.model')
      }}</label>
      <input
        id="prov-model"
        v-model="model"
        autocomplete="off"
        maxlength="200"
        class="mt-1 w-full rounded border px-2 py-1"
      />
      <p class="text-xs" style="color: var(--muted)">{{ $t('ai.providers.modelHint') }}</p>
    </div>
    <div class="flex gap-2">
      <button type="submit" :disabled="busy" class="rounded border px-3 py-1 font-medium">
        {{ $t('ai.providers.addButton') }}
      </button>
      <button type="button" class="rounded px-3 py-1" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </form>
</template>
