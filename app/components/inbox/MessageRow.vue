<script setup lang="ts">
export type Row = {
  id: string
  fromAddress: string
  fromName: string | null
  subject: string
  snippet: string
  receivedAt: string
  isRead: boolean
  priority: string | null
  needsReply: boolean | null
  summary: string | null
}
defineProps<{ row: Row; active?: boolean }>()
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <NuxtLink
    :to="`/inbox/${row.id}`"
    :class="['flex h-full flex-col justify-center border-b px-3', active ? 'ring-2' : '']"
    :aria-current="active ? 'true' : undefined"
  >
    <div class="flex items-baseline gap-2">
      <span :class="row.isRead ? '' : 'font-bold'" class="truncate">{{
        row.fromName || row.fromAddress
      }}</span>
      <span v-if="row.priority === 'p1_do_now'" class="rounded border px-1 text-xs">{{
        $t('inbox.urgent')
      }}</span>
      <span v-if="row.needsReply" class="rounded border px-1 text-xs">{{
        $t('inbox.needsReply')
      }}</span>
      <time class="ml-auto text-xs" :datetime="row.receivedAt" style="color: var(--muted)">{{
        fmt(row.receivedAt)
      }}</time>
    </div>
    <div :class="row.isRead ? '' : 'font-semibold'" class="truncate">
      {{ row.subject || $t('inbox.noSubject') }}
    </div>
    <div class="truncate text-sm" style="color: var(--muted)">{{ row.summary || row.snippet }}</div>
    <span v-if="!row.isRead" class="sr-only">{{ $t('inbox.unread') }}</span>
  </NuxtLink>
</template>
