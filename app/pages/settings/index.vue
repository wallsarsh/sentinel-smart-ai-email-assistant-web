<script setup lang="ts">
import { SETTINGS_SECTIONS } from '~/utils/settings-sections'
import type { Me } from '~/utils/route-guard'

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  useState<boolean>('me-loaded').value = false
  useState<Me>('me').value = null
  await navigateTo('/login')
}
</script>

<template>
  <section class="space-y-5">
    <h1 class="text-2xl font-semibold">{{ $t('nav.settings') }}</h1>
    <ul class="space-y-2">
      <li v-for="s in SETTINGS_SECTIONS" :key="s.key">
        <NuxtLink :to="s.to" class="block rounded border p-3" :data-testid="`section-${s.key}`">
          <span class="font-medium">{{ $t(`settings.sections.${s.key}.title`) }}</span>
          <span class="block text-sm" style="color: var(--muted)">{{
            $t(`settings.sections.${s.key}.hint`)
          }}</span>
        </NuxtLink>
      </li>
    </ul>
    <button type="button" class="rounded border px-4 py-2" data-testid="sign-out" @click="signOut">
      {{ $t('settings.signOut') }}
    </button>
  </section>
</template>
