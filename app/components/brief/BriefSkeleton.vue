<template>
  <div role="status" aria-live="polite" data-testid="skeleton">
    <p>{{ $t('brief.generating') }}</p>
    <div class="mt-3 space-y-3" aria-hidden="true">
      <div
        v-for="h in [96, 24, 56, 56]"
        :key="h"
        class="animate-pulse rounded border"
        :style="{ height: `${h}px` }"
      />
    </div>
  </div>
</template>
