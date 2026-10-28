<script setup lang="ts">
import { ref } from 'vue'
import type { AuditRow } from '~/components/security/AuditLog.vue'
import type { SessionRow } from '~/components/security/SessionList.vue'
import type { Me } from '~/utils/route-guard'

const { data: sessions, refresh } = await useFetch<{ sessions: SessionRow[] }>('/api/auth/sessions')
const { data: audit } = await useFetch<AuditRow[]>('/api/account/audit')
const failed = ref(false)

async function revoke(handle: string) {
  failed.value = false
  const current = sessions.value?.sessions.find((s) => s.handle === handle)?.current
  try {
    await $fetch(`/api/auth/sessions/${handle}`, { method: 'DELETE' })
  } catch {
    failed.value = true
  }
  if (current) {
    useState<boolean>('me-loaded').value = false
    useState<Me>('me').value = null
    await navigateTo('/login')
    return
  }
  await refresh()
}
async function revokeOthers() {
  failed.value = false
  await $fetch('/api/auth/sessions/revoke-others', { method: 'POST' }).catch(() => {
    failed.value = true
  })
  await refresh()
}
</script>

<template>
  <section class="space-y-8">
    <h1 class="text-2xl font-semibold">{{ $t('security.title') }}</h1>
    <FailureBanner v-if="failed" :failure="{ kind: 'network' }" />
    <SecurityPasswordForm />
    <SecurityMfaPanel />
    <SecuritySessionList
      :sessions="sessions?.sessions ?? []"
      @revoke="revoke"
      @revoke-others="revokeOthers"
    />
    <SecurityAuditLog :rows="audit ?? []" />
  </section>
</template>
