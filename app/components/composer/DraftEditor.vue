<script setup lang="ts">
import { computed } from 'vue'
import { highlightSegments } from '#shared/draft-scan'

const props = defineProps<{ modelValue: string; known: string[]; streaming: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string]; generate: []; stop: [] }>()
const segments = computed(() => highlightSegments(props.modelValue, props.known))
const flagged = computed(() => segments.value.filter((s) => s.kind !== 'text'))
const hasFlags = computed(() => flagged.value.length > 0)
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <label for="composer-body" class="text-sm font-medium">{{ $t('composer.body') }}</label>
      <button
        v-if="!streaming"
        type="button"
        class="ml-auto rounded border px-3 py-1 text-sm font-medium"
        @click="emit('generate')"
      >
        {{ $t('composer.generate') }}
      </button>
      <button
        v-else
        type="button"
        class="ml-auto rounded border px-3 py-1 text-sm font-medium"
        @click="emit('stop')"
      >
        {{ $t('composer.stop') }}
      </button>
    </div>
    <textarea
      id="composer-body"
      :value="modelValue"
      rows="12"
      :readonly="streaming"
      :aria-busy="streaming"
      class="w-full rounded border px-2 py-1 font-sans"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="streaming" role="status" class="text-sm">{{ $t('composer.writing') }}</p>
    <section
      v-if="hasFlags && !streaming"
      class="rounded border p-2 text-sm"
      :aria-label="$t('composer.check')"
    >
      <h3 class="font-semibold">{{ $t('composer.check') }}</h3>
      <p style="color: var(--muted)">{{ $t('composer.checkHint') }}</p>
      <p class="mt-1 whitespace-pre-wrap break-words" data-testid="preview">
        <template v-for="(s, i) in segments" :key="i"
          ><mark v-if="s.kind !== 'text'" :data-kind="s.kind" class="rounded px-0.5"
            ><span class="sr-only">{{ $t(`composer.flag.${s.kind}`) }}: </span>{{ s.text }}</mark
          ><template v-else>{{ s.text }}</template></template
        >
      </p>
    </section>
  </div>
</template>
