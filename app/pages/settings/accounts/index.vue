<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WireFailure } from '../../../utils/failure-presenter'

type Account = {
  id: string
  type: 'gmail' | 'microsoft_graph' | 'imap'
  email: string
  displayName: string
  status: string
  aiExcluded: boolean
}
const route = useRoute()
const { data, refresh } = await useFetch<{ accounts: Account[] }>('/api/accounts')
const accounts = computed(() => data.value?.accounts ?? [])
const adding = ref(false)
const picking = ref<string | null>(null)
const failure = ref<WireFailure | null>(null)

const outcome = computed(() => String(route.query.connect ?? ''))
const adminHelp = computed(() => route.query.help === 'admin_consent_required')

async function toggleAi(a: Account) {
  try {
    await $fetch(`/api/accounts/${a.id}`, { method: 'PATCH', body: { aiExcluded: !a.aiExcluded } })
    await refresh()
  } catch {
    failure.value = { kind: 'storage' }
  }
}
async function remove(a: Account) {
  if (!confirm(`${a.email}`)) return
  try {
    await $fetch(`/api/accounts/${a.id}`, { method: 'DELETE' })
    await refresh()
  } catch {
    failure.value = { kind: 'storage' }
  }
}
const reconnectUrl = (a: Account) =>
  a.type === 'gmail' ? '/api/accounts/google/connect' : '/api/accounts/microsoft/connect'
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('accounts.title') }}</h1>
    <p v-if="outcome === 'ok'" role="status">{{ $t('accounts.connected') }}</p>
    <p v-else-if="outcome" role="alert">
      {{
        $t(
          `accounts.connectError.${['denied', 'expired', 'bad_state', 'scope_missing', 'no_refresh_token'].includes(outcome) ? outcome : 'generic'}`,
        )
      }}
    </p>
    <AccountsAdminConsentHelp v-if="adminHelp" />
    <FailureBanner v-if="failure" :failure="failure" />

    <p v-if="!accounts.length">{{ $t('accounts.empty') }}</p>
    <ul class="space-y-2">
      <li v-for="a in accounts" :key="a.id" class="rounded border p-3">
        <div class="flex flex-wrap items-center gap-2">
          <strong>{{ a.displayName || a.email }}</strong>
          <span class="text-sm" style="color: var(--muted)">{{ a.email }}</span>
          <span class="rounded border px-1 text-xs">{{ $t(`accounts.type.${a.type}`) }}</span>
          <span v-if="a.status !== 'active'" class="text-sm" role="status">{{
            $t('failure.auth.needs_reauth')
          }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="a.aiExcluded" @change="toggleAi(a)" >
            {{ $t('accounts.aiExcluded') }}
          </label>
          <a
            v-if="a.status !== 'active' && a.type !== 'imap'"
            :href="reconnectUrl(a)"
            class="rounded border px-2 py-1 text-sm"
            >{{ $t('accounts.reconnect') }}</a
          >
          <button
            type="button"
            class="rounded border px-2 py-1 text-sm"
            @click="picking = picking === a.id ? null : a.id"
          >
            {{ $t('accounts.folders.manage') }}
          </button>
          <button type="button" class="rounded border px-2 py-1 text-sm" @click="remove(a)">
            {{ $t('accounts.remove') }}
          </button>
        </div>
        <AccountsFolderPicker
          v-if="picking === a.id"
          :account-id="a.id"
          class="mt-3"
          @saved="picking = null"
        />
      </li>
    </ul>

    <div v-if="!adding" class="flex flex-wrap gap-2">
      <a href="/api/accounts/google/connect" class="rounded border px-3 py-1 font-medium">{{
        $t('accounts.connectGoogle')
      }}</a>
      <a href="/api/accounts/microsoft/connect" class="rounded border px-3 py-1 font-medium">{{
        $t('accounts.connectMicrosoft')
      }}</a>
      <button type="button" class="rounded border px-3 py-1 font-medium" @click="adding = true">
        {{ $t('accounts.connectImap') }}
      </button>
    </div>
    <AccountsImapWizard
      v-else
      @added="
        adding = false
        refresh()
      "
      @cancel="adding = false"
    />
  </section>
</template>
