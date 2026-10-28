<script setup lang="ts">
defineProps<{ priority: string }>()
const KNOWN = ['p1_do_now', 'p2_today', 'p3_this_week', 'p4_fyi']
</script>

<template>
  <!-- Priority is always written out; colour is only a hint. -->
  <span
    class="inline-flex items-center gap-1 rounded border px-1.5 text-xs font-medium"
    :data-priority="priority"
  >
    <span aria-hidden="true">{{
      $t(`triage.priorityIcon.${KNOWN.includes(priority) ? priority : 'p4_fyi'}`)
    }}</span>
    {{ $t(`triage.priority.${KNOWN.includes(priority) ? priority : 'p4_fyi'}`) }}
  </span>
</template>
