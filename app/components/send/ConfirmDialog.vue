<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

export type Preview = {
  from: { address: string; name?: string }
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  placeholders: string[]
  flags: {
    newRecipients: string[]
    externalDomains: string[]
    foreign: { kind: string; value: string }[]
  }
  contentHash: string
}
const props = defineProps<{ preview: Preview; needsPassword: boolean; busy?: boolean }>()
const emit = defineEmits<{
  confirm: [{ placeholderOverride: boolean; password?: string }]
  cancel: []
}>()

const bodyBox = ref<HTMLElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)
const reachedEnd = ref(false)
const override = ref(false)
const password = ref('')

function checkEnd() {
  const el = bodyBox.value
  if (el && el.scrollHeight > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
    reachedEnd.value = true
}
onMounted(async () => {
  await nextTick()
  cancelBtn.value?.focus()
  // Short messages need no scrolling. Without layout (no height yet) only a very short text counts as fully visible.
  if (bodyBox.value && bodyBox.value.scrollHeight === 0 && props.preview.bodyText.length < 300)
    reachedEnd.value = true
  else checkEnd()
})

const needsOverride = computed(() => props.preview.placeholders.length > 0)
const canSend = computed(
  () =>
    reachedEnd.value &&
    (!needsOverride.value || override.value) &&
    (!props.needsPassword || password.value.length > 0) &&
    !props.busy,
)
const who = (a: string) => a
function send() {
  if (!canSend.value) return
  emit('confirm', {
    placeholderOverride: override.value,
    ...(props.needsPassword ? { password: password.value } : {}),
  })
  password.value = ''
}
</script>

<template>
  <div
    class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
    @keydown.esc="emit('cancel')"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-title"
      class="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-auto rounded p-4"
      style="background: var(--bg); color: var(--text)"
    >
      <h2 id="send-title" class="text-lg font-semibold">{{ $t('send.title') }}</h2>
      <dl class="grid grid-cols-[auto,1fr] gap-x-3 text-sm">
        <dt class="font-medium">{{ $t('send.from') }}</dt>
        <dd>
          {{
            preview.from.name
              ? `${preview.from.name} <${preview.from.address}>`
              : preview.from.address
          }}
        </dd>
        <dt class="font-medium">{{ $t('composer.to') }}</dt>
        <dd>{{ preview.to.map(who).join(', ') }}</dd>
        <template v-if="preview.cc.length"
          ><dt class="font-medium">{{ $t('composer.cc') }}</dt>
          <dd>{{ preview.cc.map(who).join(', ') }}</dd></template
        >
        <dt class="font-medium">{{ $t('send.subject') }}</dt>
        <dd>{{ preview.subject }}</dd>
      </dl>

      <section
        v-if="
          preview.flags.newRecipients.length ||
          preview.flags.externalDomains.length ||
          preview.flags.foreign.length ||
          preview.placeholders.length
        "
        class="rounded border p-2 text-sm"
        role="note"
        :aria-label="$t('send.warnings')"
      >
        <h3 class="font-semibold">{{ $t('send.warnings') }}</h3>
        <ul class="list-disc pl-5">
          <li v-if="preview.flags.newRecipients.length">
            {{ $t('send.newRecipients', { list: preview.flags.newRecipients.join(', ') }) }}
          </li>
          <li v-if="preview.flags.externalDomains.length">
            {{ $t('send.external', { list: preview.flags.externalDomains.join(', ') }) }}
          </li>
          <li v-if="preview.flags.foreign.length">
            {{ $t('send.foreign', { list: preview.flags.foreign.map((f) => f.value).join(', ') }) }}
          </li>
          <li v-if="preview.placeholders.length">
            {{ $t('send.placeholders', { list: preview.placeholders.join(', ') }) }}
          </li>
        </ul>
      </section>

      <div>
        <p class="text-sm font-medium">{{ $t('send.body') }}</p>
        <div
          ref="bodyBox"
          tabindex="0"
          role="region"
          :aria-label="$t('send.body')"
          class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-sm"
          data-testid="body"
          @scroll.passive="checkEnd"
        >
          {{ preview.bodyText }}
        </div>
        <p v-if="!reachedEnd" class="text-xs" style="color: var(--muted)" role="status">
          {{ $t('send.scrollToEnd') }}
        </p>
      </div>

      <label v-if="needsOverride" class="flex items-start gap-2 text-sm"
        ><input v-model="override" type="checkbox" class="mt-1" />{{ $t('send.override') }}</label
      >
      <div v-if="needsPassword">
        <label for="send-password" class="block text-sm font-medium">{{
          $t('send.password')
        }}</label>
        <input
          id="send-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full rounded border px-2 py-1"
        />
      </div>

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
          :disabled="!canSend"
          class="rounded border px-3 py-1 font-medium"
          @click="send"
        >
          {{ $t('send.sendNow') }}
        </button>
      </div>
      <p class="text-xs" style="color: var(--muted)">{{ $t('send.undoNote') }}</p>
    </div>
  </div>
</template>
