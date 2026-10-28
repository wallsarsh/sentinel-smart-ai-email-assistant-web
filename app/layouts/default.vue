<script setup lang="ts">
import type { NavItem } from '~/components/shell/AppNav.vue'

const route = useRoute()
const items: NavItem[] = [
  { to: '/', labelKey: 'brief', icon: '☀' },
  { to: '/inbox', labelKey: 'inbox', icon: '✉' },
  { to: '/actions', labelKey: 'actions', icon: '✓' },
  { to: '/settings', labelKey: 'settings', icon: '⚙' },
]
</script>

<template>
  <div class="min-h-screen md:flex">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-20 focus:rounded focus:px-3 focus:py-2"
      style="background: var(--primary); color: var(--primary-text)"
    >
      {{ $t('nav.skip') }}
    </a>
    <ShellAppNav :items="items" :current="route.path" />
    <main id="main" class="flex-1 p-4 pb-20 md:p-8 md:pb-8" tabindex="-1">
      <ShellOfflineBanner />
      <slot />
    </main>
  </div>
</template>
