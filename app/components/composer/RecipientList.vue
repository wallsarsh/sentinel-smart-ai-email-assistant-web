<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ label: string; id: string; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const draft = ref('')
const invalid = ref(false)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function add() {
  const v = draft.value.trim().replace(/,$/, '').toLowerCase()
  if (!v) return
  if (!EMAIL.test(v)) {
    invalid.value = true
    return
  }
  invalid.value = false
  if (!props.modelValue.includes(v)) emit('update:modelValue', [...props.modelValue, v])
  draft.value = ''
}
const remove = (a: string) =>
  emit(
    'update:modelValue',
    props.modelValue.filter((x) => x !== a),
  )
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium">{{ label }}</label>
    <ul class="my-1 flex flex-wrap gap-1" :aria-label="label">
      <li
        v-for="a in modelValue"
        :key="a"
        class="flex items-center gap-1 rounded-full border px-2 text-sm"
      >
        {{ a }}
        <button
          type="button"
          class="min-h-8 min-w-8 px-1"
          :aria-label="$t('composer.removeRecipient', { address: a })"
          @click="remove(a)"
        >
          {{ $t('composer.removeMark') }}
        </button>
      </li>
    </ul>
    <input
      :id="id"
      v-model="draft"
      type="email"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? `${id}-err` : undefined"
      class="w-full rounded border px-2 py-1"
      @keydown.enter.prevent="add"
      @blur="add"
      @keydown.,.prevent="add"
    />
    <p v-if="invalid" :id="`${id}-err`" role="alert" class="text-sm">
      {{ $t('composer.badAddress') }}
    </p>
  </div>
</template>
