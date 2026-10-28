<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { draftStore, streamDraft, type SavedDraft } from '~/utils/draft-stream'
import type { WireFailure } from '~/utils/failure-presenter'
import type { Detail } from '~/components/message/MessageCard.vue'

type Info = {
  accountId: string
  accountEmail: string
  aiExcluded: boolean
  subject: string
  reply: { to: { address: string }[]; cc: { address: string }[] }
  replyAll: { to: { address: string }[]; cc: { address: string }[] }
  signature: string
}
const route = useRoute()
const id = computed(() => String(route.params.id))
const [{ data: detail }, { data: info }] = await Promise.all([
  useFetch<{ message: Detail; thread: (Detail & { bodyText: string })[] }>(
    () => `/api/messages/${id.value}`,
  ),
  useFetch<Info>(() => `/api/messages/${id.value}/reply-info`),
])

const tone = ref('professional')
const intent = ref('acknowledge')
const instruction = ref('')
const mode = ref<'reply' | 'reply_all'>('reply')
const text = ref('')
const to = ref<string[]>([])
const cc = ref<string[]>([])
const streaming = ref(false)
const failure = ref<WireFailure | null>(null)
let handle: ReturnType<typeof streamDraft> | null = null

const store = draftStore(
  import.meta.client
    ? (() => {
        try {
          return window.localStorage
        } catch {
          return null
        }
      })()
    : null,
)
const known = computed(() =>
  (detail.value?.thread ?? [])
    .flatMap((m) => [
      m.bodyText,
      m.fromAddress,
      ...m.toJson.map((a) => a.address),
      ...m.ccJson.map((a) => a.address),
    ])
    .concat(info.value?.signature ?? '', info.value?.accountEmail ?? ''),
)

function applyMode(m: 'reply' | 'reply_all') {
  mode.value = m
  const r = m === 'reply' ? info.value?.reply : info.value?.replyAll
  to.value = (r?.to ?? []).map((a) => a.address)
  cc.value = (r?.cc ?? []).map((a) => a.address)
}

onMounted(() => {
  applyMode('reply')
  const saved = store.load(id.value)
  if (saved) {
    text.value = saved.text
    tone.value = saved.tone
    intent.value = saved.intent
    instruction.value = saved.instruction
    mode.value = saved.mode
    to.value = saved.to
    cc.value = saved.cc
  }
})
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [text, tone, intent, instruction, mode, to, cc],
  () => {
    clearTimeout(timer)
    timer = setTimeout(
      () =>
        store.save(id.value, {
          text: text.value,
          tone: tone.value,
          intent: intent.value,
          instruction: instruction.value,
          mode: mode.value,
          to: to.value,
          cc: cc.value,
        } satisfies SavedDraft),
      400,
    )
  },
  { deep: true },
)

function generate() {
  failure.value = null
  text.value = ''
  streaming.value = true
  const csrf = useCookie('sentinel_csrf').value ?? undefined
  handle = streamDraft(
    {
      messageId: id.value,
      tone: tone.value,
      intent: intent.value,
      instruction: instruction.value || undefined,
    },
    (e) => {
      if (e.type === 'delta') text.value += e.text
      else if (e.type === 'done') {
        text.value = e.text
        streaming.value = false
      } else {
        failure.value = e.failure
        streaming.value = false
      }
    },
    { csrf },
  )
  void handle.finished.finally(() => (streaming.value = false))
}
function stop() {
  handle?.stop()
  streaming.value = false // the text so far stays; nothing is lost
}
onBeforeUnmount(() => {
  handle?.stop()
  clearTimeout(timer)
})
</script>

<template>
  <section class="space-y-4">
    <NuxtLink :to="`/inbox/${id}`" class="text-sm underline">{{
      '← ' + $t('composer.backToMessage')
    }}</NuxtLink>
    <h1 class="text-xl font-semibold">{{ info?.subject }}</h1>
    <FailureBanner
      v-if="info?.aiExcluded"
      :failure="{ kind: 'forbidden', detail: { code: 'ai_excluded' } }"
    />
    <FailureBanner v-if="failure" :failure="failure" />
    <div role="radiogroup" :aria-label="$t('composer.mode')" class="flex gap-2">
      <button
        v-for="m in ['reply', 'reply_all'] as const"
        :key="m"
        type="button"
        role="radio"
        :aria-checked="mode === m"
        :class="['rounded border px-3 py-1 text-sm', mode === m ? 'font-semibold' : '']"
        @click="applyMode(m)"
      >
        {{ $t(`composer.modeName.${m}`) }}
      </button>
    </div>
    <ComposerRecipientList id="composer-to" v-model="to" :label="$t('composer.to')" />
    <ComposerRecipientList id="composer-cc" v-model="cc" :label="$t('composer.cc')" />
    <ComposerToneIntent
      v-model:tone="tone"
      v-model:intent="intent"
      v-model:instruction="instruction"
    />
    <ComposerDraftEditor
      v-model="text"
      :known="known"
      :streaming="streaming"
      @generate="generate"
      @stop="stop"
    />
    <p v-if="info?.signature" class="whitespace-pre-wrap text-sm" style="color: var(--muted)">
      {{ info.signature }}
    </p>
    <p class="text-xs" style="color: var(--muted)">{{ $t('composer.neverSends') }}</p>
  </section>
</template>
