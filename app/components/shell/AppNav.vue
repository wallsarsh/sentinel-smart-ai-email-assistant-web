<script setup lang="ts">
export type NavItem = { to: string; labelKey: string; icon: string }

defineProps<{ items: NavItem[]; current: string }>()
</script>

<template>
  <nav
    :aria-label="$t('nav.main')"
    class="fixed inset-x-0 bottom-0 z-10 flex border-t md:static md:inset-auto md:w-56 md:flex-col md:border-r md:border-t-0"
    style="background: var(--surface); border-color: var(--border)"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :aria-current="
        current === item.to || (item.to !== '/' && current.startsWith(item.to)) ? 'page' : undefined
      "
      class="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-sm md:flex-none md:flex-row md:justify-start md:gap-3"
      :data-testid="`nav-${item.labelKey}`"
    >
      <span aria-hidden="true">{{ item.icon }}</span>
      <span>{{ $t(`nav.${item.labelKey}`) }}</span>
    </NuxtLink>
  </nav>
</template>
