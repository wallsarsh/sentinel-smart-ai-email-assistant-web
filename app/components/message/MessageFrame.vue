<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { buildFrameDoc, decideLink, frameCsp, parseFrameMessage } from '../../utils/message-frame'
import type { LinkAssessment } from '#shared/link-guard'

const props = defineProps<{ html: string; loadImages: boolean }>()
const frame = ref<HTMLIFrameElement | null>(null)
const height = ref(120)
const pending = ref<LinkAssessment | null>(null)
const doc = computed(() => buildFrameDoc(props.html, { loadImages: props.loadImages }))
const csp = computed(() => frameCsp(props.loadImages))

function open(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
function onMessage(e: MessageEvent) {
  // Only our own frame, and only the two message shapes we defined.
  if (!frame.value || e.source !== frame.value.contentWindow) return
  const m = parseFrameMessage(e.data)
  if (!m) return
  if (m.sentinel === 'height') height.value = m.value
  else {
    const d = decideLink(m.href, m.text)
    if (d.action === 'open') open(d.url)
    else if (d.action === 'confirm') pending.value = d.assessment
  }
}
onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div>
    <!-- allow-scripts without allow-same-origin: the frame's script runs in an opaque origin and the CSP allows only our hashed script. -->
    <iframe
      ref="frame"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      :csp="csp"
      :srcdoc="doc"
      :title="$t('message.body')"
      :style="{ height: `${height}px` }"
      class="w-full border-0"
      loading="lazy"
    />
    <MessageLinkGuardDialog
      v-if="pending"
      :assessment="pending"
      @cancel="pending = null"
      @open="
        (u: string) => {
          open(u)
          pending = null
        }
      "
    />
  </div>
</template>
