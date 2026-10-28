<script setup lang="ts">
import { computed, ref } from 'vue'
import { visibleRange } from '../../utils/virtual-list'
import type { Row } from './MessageRow.vue'

const props = withDefaults(
  defineProps<{ rows: Row[]; activeId?: string | null; rowHeight?: number; height?: number }>(),
  { activeId: null, rowHeight: 76, height: 560 },
)
const emit = defineEmits<{ nearEnd: [] }>()
const top = ref(0)
const range = computed(() =>
  visibleRange({
    scrollTop: top.value,
    viewport: props.height,
    rowHeight: props.rowHeight,
    total: props.rows.length,
  }),
)
const shown = computed(() => props.rows.slice(range.value.start, range.value.end))

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  top.value = el.scrollTop
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - props.rowHeight * 10) emit('nearEnd')
}
defineExpose({
  scrollToIndex: (i: number, el?: HTMLElement | null) => el && (el.scrollTop = i * props.rowHeight),
})
</script>

<template>
  <div
    class="overflow-auto"
    :style="{ height: `${height}px` }"
    role="list"
    :aria-label="$t('inbox.list')"
    tabindex="-1"
    @scroll.passive="onScroll"
  >
    <div :style="{ paddingTop: `${range.padTop}px`, paddingBottom: `${range.padBottom}px` }">
      <div v-for="r in shown" :key="r.id" role="listitem" :style="{ height: `${rowHeight}px` }">
        <InboxMessageRow :row="r" :active="r.id === activeId" />
      </div>
    </div>
  </div>
</template>
