<script setup lang="ts">
export type BgRun = {
  id: string
  trigger: string
  startedAt: string
  endedAt: string | null
  outcome: string | null
  newMessages: number
  triaged: number
  errorCode: string | null
}
export type StatusAccount = {
  id: string
  email: string
  status: string
  lastSyncAt: string | null
}
defineProps<{ runs: BgRun[]; accounts: StatusAccount[] }>()
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <section aria-labelledby="bg-accounts">
      <h2 id="bg-accounts" class="font-semibold">{{ $t('bg.accountsTitle') }}</h2>
      <p v-if="!accounts.length" style="color: var(--muted)">{{ $t('bg.noAccounts') }}</p>
      <ul v-else class="mt-1 space-y-1">
        <li v-for="a in accounts" :key="a.id" :data-testid="`acct-${a.id}`">
          <span class="font-medium">{{ a.email }}</span>
          <span v-if="a.status !== 'active'" class="ml-2 text-sm" role="status">{{
            $t('bg.accountNeedsAttention')
          }}</span>
          <span class="ml-2 text-sm" style="color: var(--muted)">{{
            a.lastSyncAt ? $t('bg.lastFetched', { when: when(a.lastSyncAt) }) : $t('bg.noMailYet')
          }}</span>
        </li>
      </ul>
    </section>
    <section aria-labelledby="bg-runs">
      <h2 id="bg-runs" class="font-semibold">{{ $t('bg.runsTitle') }}</h2>
      <p v-if="!runs.length" style="color: var(--muted)">{{ $t('bg.neverRan') }}</p>
      <ul v-else class="mt-1 space-y-2">
        <li v-for="r in runs" :key="r.id" class="rounded border p-2" :data-testid="`run-${r.id}`">
          <span>{{ when(r.startedAt) }}</span>
          <span class="ml-2 text-sm">{{
            $t('bg.runSummary', { new: r.newMessages, triaged: r.triaged })
          }}</span>
          <span class="ml-2 text-sm font-medium">{{
            $t(`bg.outcome.${r.outcome ?? 'running'}`)
          }}</span>
          <span v-if="r.errorCode" class="ml-2 text-sm" data-testid="error">{{
            $t('bg.lastError', { code: r.errorCode })
          }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
