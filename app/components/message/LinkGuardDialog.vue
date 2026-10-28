<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { LinkAssessment } from '#shared/link-guard'

const props = defineProps<{ assessment: LinkAssessment }>()
const emit = defineEmits<{ open: [string]; cancel: [] }>()
const cancelBtn = ref<HTMLButtonElement | null>(null)
onMounted(() => cancelBtn.value?.focus())
</script>

<template>
  <div
    class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
    @keydown.esc="emit('cancel')"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="lg-title"
      aria-describedby="lg-desc"
      class="max-w-md space-y-3 rounded p-4"
      style="background: var(--bg); color: var(--text)"
    >
      <h2 id="lg-title" class="text-lg font-semibold">{{ $t('message.link.title') }}</h2>
      <p id="lg-desc" class="break-all text-sm">
        <strong>{{ props.assessment.host || props.assessment.url.protocol }}</strong
        ><span class="block">{{ props.assessment.url.toString() }}</span>
      </p>
      <ul class="list-disc pl-5 text-sm">
        <li v-for="r in props.assessment.risks" :key="r">
          {{ $t(`message.link.risk.${r}`, { host: props.assessment.shownHost ?? '' }) }}
        </li>
      </ul>
      <div class="flex gap-2">
        <button
          ref="cancelBtn"
          type="button"
          class="rounded border px-3 py-1 font-medium"
          @click="emit('cancel')"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          type="button"
          class="rounded border px-3 py-1"
          @click="emit('open', props.assessment.url.toString())"
        >
          {{ $t('message.link.open') }}
        </button>
      </div>
    </div>
  </div>
</template>
