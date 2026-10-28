<script setup lang="ts">
import { ref } from 'vue'

export type Detail = {
  id: string
  fromAddress: string
  fromName: string | null
  subject: string
  sentAt: string
  toJson: { address: string; name?: string }[]
  ccJson: { address: string; name?: string }[]
  bodyText: string
  bodyHtmlSanitized: string | null
  attachmentNames: string[]
}
const props = defineProps<{ message: Detail; expanded: boolean }>()
const open = ref(props.expanded)
const images = ref(false)
const hasRemoteImages = (h: string | null) => !!h && h.includes('data-remote-src="https:')
const who = (a: { address: string; name?: string }) => a.name || a.address
</script>

<template>
  <article class="rounded border">
    <button
      type="button"
      class="flex w-full items-baseline gap-2 p-3 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <strong class="truncate">{{ message.fromName || message.fromAddress }}</strong>
      <time class="ml-auto text-xs" :datetime="message.sentAt">{{
        new Date(message.sentAt).toLocaleString()
      }}</time>
    </button>
    <div v-if="open" class="space-y-3 border-t p-3">
      <p class="text-sm" style="color: var(--muted)">
        {{ $t('message.to') }} {{ message.toJson.map(who).join(', ')
        }}<template v-if="message.ccJson.length">
          {{ '· ' + $t('message.cc') }} {{ message.ccJson.map(who).join(', ') }}</template
        >
      </p>
      <div
        v-if="hasRemoteImages(message.bodyHtmlSanitized) && !images"
        class="flex items-center gap-2 rounded border p-2 text-sm"
        role="note"
      >
        {{ $t('message.imagesBlocked') }}
        <button type="button" class="rounded border px-2 py-1" @click="images = true">
          {{ $t('message.loadImages') }}
        </button>
      </div>
      <MessageFrame
        v-if="message.bodyHtmlSanitized"
        :html="message.bodyHtmlSanitized"
        :load-images="images"
      />
      <pre v-else class="whitespace-pre-wrap break-words font-sans text-sm">{{
        message.bodyText
      }}</pre>
      <section v-if="message.attachmentNames.length" :aria-label="$t('message.attachments')">
        <h3 class="text-sm font-semibold">{{ $t('message.attachments') }}</h3>
        <ul class="text-sm">
          <li v-for="n in message.attachmentNames" :key="n">{{ '📎 ' + n }}</li>
        </ul>
        <p class="text-xs" style="color: var(--muted)">{{ $t('message.attachmentsNote') }}</p>
      </section>
    </div>
  </article>
</template>
