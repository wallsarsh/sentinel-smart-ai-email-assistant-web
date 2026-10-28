<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Row } from '~/components/inbox/MessageRow.vue'

type Account = { id: string; email: string; displayName: string }
const segment = ref('all')
const accountId = ref('')
const rows = ref<Row[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const failed = ref(false)
const counts = ref<Record<string, number>>({})
const activeIndex = ref(0)
const accounts = ref<Account[]>([])
const online = ref(true)

const query = () => ({
  segment: segment.value,
  ...(accountId.value ? { accountId: accountId.value } : {}),
})

async function loadCounts() {
  try {
    counts.value = (
      await $fetch<{ counts: Record<string, number> }>('/api/inbox/counts', {
        query: accountId.value ? { accountId: accountId.value } : {},
      })
    ).counts
  } catch {
    /* counts are decoration; the list shows the error */
  }
}
async function load(reset = false) {
  if (loading.value || (!reset && cursor.value === null && rows.value.length)) return
  loading.value = true
  failed.value = false
  try {
    const r = await $fetch<{ items: Row[]; nextCursor: string | null }>('/api/inbox', {
      query: { ...query(), ...(reset || !cursor.value ? {} : { cursor: cursor.value }) },
    })
    rows.value = reset ? r.items : [...rows.value, ...r.items]
    cursor.value = r.nextCursor
    if (reset) activeIndex.value = 0
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
const reload = () => Promise.all([load(true), loadCounts()])

onMounted(async () => {
  try {
    accounts.value = (await $fetch<{ accounts: Account[] }>('/api/accounts')).accounts
  } catch {
    /* filter just stays hidden */
  }
  await reload()
  const live = useLive()
  live.on('inbox.changed', () => void reload())
  live.on('triage.done', () => void reload())
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  online.value = navigator.onLine
})
onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})
const onOnline = () => ((online.value = true), void reload())
const onOffline = () => (online.value = false)
watch([segment, accountId], () => void reload())

const active = computed(() => rows.value[activeIndex.value]?.id ?? null)
function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'j') activeIndex.value = Math.min(activeIndex.value + 1, rows.value.length - 1)
  else if (e.key === 'k') activeIndex.value = Math.max(activeIndex.value - 1, 0)
  else if (e.key === 'Enter' && active.value) void navigateTo(`/inbox/${active.value}`)
  else if (e.key === '/') {
    e.preventDefault()
    void navigateTo('/search')
  } else return
  if (e.key === 'j' || e.key === 'k') e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

async function refresh() {
  try {
    await $fetch('/api/inbox/refresh', { method: 'POST' })
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">{{ $t('nav.inbox') }}</h1>
      <label v-if="accounts.length > 1" class="ml-auto flex items-center gap-2 text-sm">
        {{ $t('inbox.account') }}
        <select v-model="accountId" class="rounded border px-2 py-1">
          <option value="">{{ $t('inbox.allAccounts') }}</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">
            {{ a.displayName || a.email }}
          </option>
        </select>
      </label>
      <button type="button" class="rounded border px-3 py-1 text-sm" @click="refresh">
        {{ $t('inbox.refresh') }}
      </button>
    </div>
    <p v-if="!online" role="status" class="rounded border p-2 text-sm">{{ $t('inbox.offline') }}</p>
    <InboxSegmentChips v-model="segment" :counts="counts" />
    <FailureBanner v-if="failed" :failure="{ kind: 'network' }" @action="reload" />
    <p v-else-if="!loading && !rows.length" class="py-8 text-center" style="color: var(--muted)">
      {{ $t(`inbox.empty.${segment}`) }}
    </p>
    <InboxVirtualMessageList v-else :rows="rows" :active-id="active" @near-end="load()" />
    <p v-if="loading" role="status" class="text-sm">{{ $t('inbox.loading') }}</p>
    <p class="text-xs" style="color: var(--muted)">{{ $t('inbox.shortcuts') }}</p>
  </section>
</template>
