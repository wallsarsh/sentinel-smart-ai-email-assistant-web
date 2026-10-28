<script setup lang="ts">
const props = defineProps<{ modelValue: string; counts: Record<string, number> }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const segments = ['all', 'needs_reply', 'actions', 'important', 'fyi', 'newsletters']
void props
</script>

<template>
  <div role="tablist" :aria-label="$t('inbox.segments')" class="flex flex-wrap gap-2">
    <button
      v-for="s in segments"
      :id="`seg-${s}`"
      :key="s"
      type="button"
      role="tab"
      :aria-selected="modelValue === s"
      :class="['rounded-full border px-3 py-1 text-sm', modelValue === s ? 'font-semibold' : '']"
      :style="modelValue === s ? 'background: var(--primary); color: var(--primary-text)' : ''"
      @click="emit('update:modelValue', s)"
    >
      {{ $t(`inbox.segment.${s}`) }}
      <span class="ml-1 opacity-80">{{ counts[s] ?? 0 }}</span>
    </button>
  </div>
</template>
