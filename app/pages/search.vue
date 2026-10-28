<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Hit } from '~/components/inbox/SearchResult.vue'
import { recentSearches } from '~/utils/search-ui'

type Account = { id: string; email: string; displayName: string }
const q = ref('')
const accountId = ref('')
const unread = ref(false)
const hits = ref<Hit[]>([])
const searched = ref(false)
const loading = ref(false)
const failed = ref(false)
const accounts = ref<Account[]>([])
const recent = ref<string[]>([])
const store = import.meta.client
  ? (() => {
      try {
        return window.localStorage
      } catch {
        return null
      }
    })()
  : null
const history = recentSearches(store)

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
async function run() {
  const text = q.value.trim()
  if (text.length < 2) {
    hits.value = []
    searched.value = false
    return
  }
  const mine = ++seq
  loading.value = true
  failed.value = false
  try {
    const r = await $fetch<{ hits: Hit[] }>('/api/search', {
      query: {
        q: text,
        ...(accountId.value ? { accountId: accountId.value } : {}),
        ...(unread.value ? { unread: '1' } : {}),
      },
    })
    if (mine !== seq) return // a newer search is in flight
    hits.value = r.hits
    searched.value = true
    recent.value = history.add(text)
  } catch {
    if (mine === seq) failed.value = true
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([q, accountId, unread], () => {
  clearTimeout(timer)
  timer = setTimeout(run, 300)
})
onMounted(async () => {
  recent.value = history.list()
  accounts.value = (
    await $fetch<{ accounts: Account[] }>('/api/accounts').catch(() => ({ accounts: [] }))
  ).accounts
})
const status = computed(() =>
  loading.value ? 'search.searching' : searched.value ? 'search.count' : '',
)
</script>

<template>
  <section class="space-y-3">
    <h1 class="text-2xl font-semibold">{{ $t('search.title') }}</h1>
    <form role="search" class="flex flex-wrap items-end gap-3" @submit.prevent="run">
      <div class="grow">
        <label for="search-q" class="block text-sm font-medium">{{ $t('search.label') }}</label>
        <input
          id="search-q"
          v-model="q"
          type="search"
          autocomplete="off"
          autofocus
          class="w-full rounded border px-2 py-1"
        />
      </div>
      <label v-if="accounts.length > 1" class="text-sm">
        {{ $t('inbox.account') }}
        <select v-model="accountId" class="block rounded border px-2 py-1">
          <option value="">{{ $t('inbox.allAccounts') }}</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">
            {{ a.displayName || a.email }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm"
        ><input v-model="unread" type="checkbox" />{{ $t('search.unreadOnly') }}</label
      >
    </form>

    <div v-if="!searched && recent.length" class="text-sm">
      <h2 class="font-medium">{{ $t('search.recent') }}</h2>
      <ul class="flex flex-wrap gap-2">
        <li v-for="r in recent" :key="r">
          <button type="button" class="rounded-full border px-3 py-1" @click="q = r">
            {{ r }}
          </button>
        </li>
      </ul>
    </div>

    <p role="status" aria-live="polite" class="text-sm">
      {{ status && $t(status, { n: hits.length }) }}
    </p>
    <FailureBanner v-if="failed" :failure="{ kind: 'network' }" @action="run" />
    <ul v-else-if="hits.length" :aria-label="$t('search.results')" class="rounded border">
      <li v-for="h in hits" :key="h.id"><InboxSearchResult :hit="h" /></li>
    </ul>
    <p v-else-if="searched" class="py-6 text-center" style="color: var(--muted)">
      {{ $t('search.none') }}
    </p>
  </section>
</template>
