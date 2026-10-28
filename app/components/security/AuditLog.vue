<script setup lang="ts">
export type AuditRow = { at: string; event: string; detail: string; ip: string }
defineProps<{ rows: AuditRow[] }>()
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="space-y-2" aria-labelledby="sec-audit">
    <h2 id="sec-audit" class="font-semibold">{{ $t('security.audit.title') }}</h2>
    <p v-if="!rows.length" style="color: var(--muted)">{{ $t('security.audit.empty') }}</p>
    <ul v-else class="space-y-1 text-sm">
      <li v-for="(r, i) in rows" :key="i" data-testid="audit-row">
        <span>{{ when(r.at) }}</span>
        <span class="ml-2 font-medium">{{
          $te(`security.audit.events.${r.event}`) ? $t(`security.audit.events.${r.event}`) : r.event
        }}</span>
        <span v-if="r.ip" class="ml-2" style="color: var(--muted)">{{ r.ip }}</span>
      </li>
    </ul>
  </section>
</template>
