<script setup lang="ts">
import { computed } from 'vue'
import { parseHeadline } from '../../utils/search-ui'

export type Hit = {
  id: string
  subject: string
  fromAddress: string
  fromName: string | null
  receivedAt: string
  isRead: boolean
  headline: string
}
const props = defineProps<{ hit: Hit }>()
const parts = computed(() => parseHeadline(props.hit.headline))
</script>

<template>
  <NuxtLink :to="`/inbox/${hit.id}`" class="block border-b p-3">
    <div class="flex items-baseline gap-2">
      <span :class="hit.isRead ? '' : 'font-bold'" class="truncate">{{
        hit.fromName || hit.fromAddress
      }}</span>
      <time class="ml-auto text-xs" :datetime="hit.receivedAt" style="color: var(--muted)">{{
        new Date(hit.receivedAt).toLocaleDateString()
      }}</time>
    </div>
    <div class="truncate font-semibold">{{ hit.subject || $t('inbox.noSubject') }}</div>
    <p class="text-sm" style="color: var(--muted)">
      <template v-for="(p, i) in parts" :key="i"
        ><mark v-if="p.mark">{{ p.text }}</mark
        ><template v-else>{{ p.text }}</template></template
      >
    </p>
  </NuxtLink>
</template>
