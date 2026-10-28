<script setup lang="ts">
export type Item = {
  id: string
  messageId: string
  text: string
  dueAt: string | null
  dueText: string | null
  status: string
  subject: string
  fromName: string | null
  fromAddress: string
}
const props = defineProps<{
  kind: 'today' | 'upcoming' | 'noDate' | 'snoozed' | 'done'
  items: Item[]
}>()
const emit = defineEmits<{ done: [Item]; snooze: [Item]; reopen: [Item] }>()
const when = (i: Item) =>
  i.dueAt
    ? new Date(i.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : (i.dueText ?? '')
</script>

<template>
  <section v-if="items.length" :aria-labelledby="`grp-${props.kind}`">
    <h2 :id="`grp-${props.kind}`" class="font-semibold">
      {{ $t(`actions.group.${props.kind}`) }}
      <span class="text-sm" style="color: var(--muted)">{{ items.length }}</span>
    </h2>
    <ul class="mt-1 space-y-2">
      <li v-for="i in items" :key="i.id" class="rounded border p-3">
        <div class="flex flex-wrap items-baseline gap-2">
          <span :class="props.kind === 'done' ? 'line-through' : 'font-medium'">{{ i.text }}</span>
          <span
            v-if="when(i)"
            :class="props.kind === 'today' ? 'font-semibold' : ''"
            class="text-sm"
            >{{ when(i) }}</span
          >
        </div>
        <NuxtLink :to="`/inbox/${i.messageId}`" class="text-sm underline">{{
          i.subject || $t('inbox.noSubject')
        }}</NuxtLink>
        <span class="text-sm" style="color: var(--muted)"> {{ i.fromName || i.fromAddress }}</span>
        <div class="mt-2 flex gap-2">
          <button
            v-if="props.kind !== 'done'"
            type="button"
            class="rounded border px-2 py-1 text-sm"
            @click="emit('done', i)"
          >
            {{ $t('actions.markDone') }}
          </button>
          <button
            v-if="props.kind !== 'done' && props.kind !== 'snoozed'"
            type="button"
            class="rounded border px-2 py-1 text-sm"
            @click="emit('snooze', i)"
          >
            {{ $t('actions.snooze') }}
          </button>
          <button
            v-if="props.kind === 'done' || props.kind === 'snoozed'"
            type="button"
            class="rounded border px-2 py-1 text-sm"
            @click="emit('reopen', i)"
          >
            {{ $t('actions.reopen') }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
