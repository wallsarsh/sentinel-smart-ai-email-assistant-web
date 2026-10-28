<script setup lang="ts">
import { ref } from 'vue'
import type { Provider } from './ProviderCard.vue'

export type RouteRow = {
  providerId: string
  model: string
  params: { maxTokens?: number; temperature?: number }
}
const props = defineProps<{ task: string; providers: Provider[]; modelValue: RouteRow[] }>()
const emit = defineEmits<{ saved: [] }>()
const rows = ref<RouteRow[]>(props.modelValue.map((r) => ({ ...r, params: { ...r.params } })))
const saving = ref(false)
const error = ref(false)
const saved = ref(false)

const modelsFor = (id: string) => props.providers.find((p) => p.id === id)?.models ?? []
const add = () =>
  rows.value.length < 4 &&
  props.providers[0] &&
  rows.value.push({ providerId: props.providers[0].id, model: '', params: {} })
const move = (i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= rows.value.length) return
  ;[rows.value[i], rows.value[j]] = [rows.value[j]!, rows.value[i]!]
}
async function save() {
  saving.value = true
  error.value = false
  saved.value = false
  try {
    const chain = rows.value.map((r) => ({
      providerId: r.providerId,
      model: r.model,
      params: Object.fromEntries(
        Object.entries(r.params).filter(
          ([, v]) => v !== undefined && v !== null && String(v) !== '',
        ),
      ),
    }))
    await $fetch('/api/ai/routes', { method: 'PUT', body: { task: props.task, chain } })
    saved.value = true
    emit('saved')
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <fieldset class="rounded border p-3">
    <legend class="px-1 font-semibold">{{ $t(`ai.routes.task.${task}`) }}</legend>
    <p class="text-sm" style="color: var(--muted)">{{ $t(`ai.routes.hint.${task}`) }}</p>
    <ol class="mt-2 space-y-2">
      <li v-for="(r, i) in rows" :key="i" class="grid items-end gap-2 md:grid-cols-6">
        <span class="text-sm md:col-span-6">{{
          i === 0 ? $t('ai.routes.primary') : $t('ai.routes.fallback', { n: i })
        }}</span>
        <div class="md:col-span-2">
          <label :for="`${task}-p${i}`" class="block text-sm">{{ $t('ai.routes.provider') }}</label>
          <select
            :id="`${task}-p${i}`"
            v-model="r.providerId"
            class="w-full rounded border px-2 py-1"
          >
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.displayName }}</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label :for="`${task}-m${i}`" class="block text-sm">{{ $t('ai.routes.model') }}</label>
          <input
            :id="`${task}-m${i}`"
            v-model="r.model"
            :list="`${task}-models${i}`"
            required
            class="w-full rounded border px-2 py-1"
          >
          <datalist :id="`${task}-models${i}`">
            <option v-for="m in modelsFor(r.providerId)" :key="m" :value="m" />
          </datalist>
        </div>
        <div>
          <label :for="`${task}-t${i}`" class="block text-sm">{{
            $t('ai.routes.maxTokens')
          }}</label>
          <input
            :id="`${task}-t${i}`"
            v-model.number="r.params.maxTokens"
            type="number"
            min="16"
            max="32000"
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div>
          <label :for="`${task}-c${i}`" class="block text-sm">{{
            $t('ai.routes.temperature')
          }}</label>
          <input
            :id="`${task}-c${i}`"
            v-model.number="r.params.temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div class="flex gap-1 md:col-span-6">
          <button
            type="button"
            class="rounded border px-2 py-1 text-sm"
            :disabled="i === 0"
            @click="move(i, -1)"
          >
            {{ $t('ai.routes.up') }}
          </button>
          <button
            type="button"
            class="rounded border px-2 py-1 text-sm"
            :disabled="i === rows.length - 1"
            @click="move(i, 1)"
          >
            {{ $t('ai.routes.down') }}
          </button>
          <button type="button" class="rounded border px-2 py-1 text-sm" @click="rows.splice(i, 1)">
            {{ $t('ai.routes.remove') }}
          </button>
        </div>
      </li>
    </ol>
    <div class="mt-2 flex items-center gap-2">
      <button
        type="button"
        class="rounded border px-3 py-1 text-sm"
        :disabled="rows.length >= 4 || !providers.length"
        @click="add"
      >
        {{ $t('ai.routes.add') }}
      </button>
      <button
        type="button"
        class="rounded border px-3 py-1 text-sm font-medium"
        :disabled="saving"
        @click="save"
      >
        {{ $t('common.save') }}
      </button>
      <span v-if="saved" role="status" class="text-sm">{{ $t('ai.routes.saved') }}</span>
      <span v-if="error" role="alert" class="text-sm">{{ $t('failure.validation.generic') }}</span>
    </div>
  </fieldset>
</template>
