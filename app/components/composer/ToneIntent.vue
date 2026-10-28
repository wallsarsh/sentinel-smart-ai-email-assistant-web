<script setup lang="ts">
defineProps<{ tone: string; intent: string; instruction: string }>()
const emit = defineEmits<{
  'update:tone': [string]
  'update:intent': [string]
  'update:instruction': [string]
}>()
const tones = ['professional', 'friendly', 'concise', 'formal']
const intents = ['accept', 'decline', 'ask_for_info', 'acknowledge', 'custom']
</script>

<template>
  <div class="space-y-3">
    <div role="radiogroup" :aria-label="$t('composer.tone')" class="flex flex-wrap gap-2">
      <button
        v-for="t in tones"
        :key="t"
        type="button"
        role="radio"
        :aria-checked="tone === t"
        :class="['rounded-full border px-3 py-1 text-sm', tone === t ? 'font-semibold' : '']"
        :style="tone === t ? 'background: var(--primary); color: var(--primary-text)' : ''"
        @click="emit('update:tone', t)"
      >
        {{ $t(`composer.toneName.${t}`) }}
      </button>
    </div>
    <div role="radiogroup" :aria-label="$t('composer.intent')" class="flex flex-wrap gap-2">
      <button
        v-for="i in intents"
        :key="i"
        type="button"
        role="radio"
        :aria-checked="intent === i"
        :class="['rounded-full border px-3 py-1 text-sm', intent === i ? 'font-semibold' : '']"
        :style="intent === i ? 'background: var(--primary); color: var(--primary-text)' : ''"
        @click="emit('update:intent', i)"
      >
        {{ $t(`composer.intentName.${i}`) }}
      </button>
    </div>
    <div>
      <label for="composer-instruction" class="block text-sm font-medium">{{
        $t('composer.instruction')
      }}</label>
      <textarea
        id="composer-instruction"
        :value="instruction"
        rows="2"
        maxlength="500"
        class="w-full rounded border px-2 py-1"
        @input="emit('update:instruction', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
  </div>
</template>
