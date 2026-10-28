<script setup lang="ts">
export type SessionRow = {
  handle: string
  userAgent: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}
defineProps<{ sessions: SessionRow[] }>()
const emit = defineEmits<{ revoke: [string]; revokeOthers: [] }>()
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="space-y-3" aria-labelledby="sec-sessions">
    <h2 id="sec-sessions" class="font-semibold">{{ $t('security.sessions.title') }}</h2>
    <ul class="space-y-2">
      <li
        v-for="s in sessions"
        :key="s.handle"
        class="rounded border p-3"
        :data-testid="`session-${s.handle}`"
      >
        <span class="font-medium">{{ s.userAgent || $t('security.sessions.unknown') }}</span>
        <span v-if="s.current" class="ml-2 text-sm" data-testid="current">{{
          $t('security.sessions.current')
        }}</span>
        <span class="block text-sm" style="color: var(--muted)">{{
          $t('security.sessions.lastSeen', { when: when(s.lastSeenAt) })
        }}</span>
        <button
          type="button"
          class="mt-2 rounded border px-3 py-1 text-sm"
          :data-testid="`revoke-${s.handle}`"
          @click="emit('revoke', s.handle)"
        >
          {{ s.current ? $t('security.sessions.signOutHere') : $t('security.sessions.revoke') }}
        </button>
      </li>
    </ul>
    <button
      v-if="sessions.length > 1"
      type="button"
      class="rounded border px-3 py-2"
      data-testid="revoke-others"
      @click="emit('revokeOthers')"
    >
      {{ $t('security.sessions.revokeOthers') }}
    </button>
  </section>
</template>
