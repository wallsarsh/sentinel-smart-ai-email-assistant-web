<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ saved: [] }>()
type Folder = { providerId: string; name: string; role: string; processed: boolean }
const folders = ref<Folder[]>([])
const chosen = ref<string[]>([])
const saving = ref(false)
const error = ref(false)

onMounted(async () => {
  const r = await $fetch<{ folders: Folder[] }>(`/api/accounts/${props.accountId}/folders`)
  folders.value = r.folders
  chosen.value = r.folders.filter((f) => f.processed).map((f) => f.providerId)
})

async function save() {
  saving.value = true
  error.value = false
  try {
    await $fetch(`/api/accounts/${props.accountId}/folders`, {
      method: 'PUT',
      body: { processed: chosen.value },
    })
    emit('saved')
  } catch {
    error.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form @submit.prevent="save">
    <fieldset>
      <legend class="font-medium">{{ $t('accounts.folders.title') }}</legend>
      <p class="text-sm" style="color: var(--muted)">{{ $t('accounts.folders.hint') }}</p>
      <div v-for="f in folders" :key="f.providerId" class="mt-1">
        <label class="flex items-center gap-2">
          <input v-model="chosen" type="checkbox" :value="f.providerId" />
          {{ f.name }}
        </label>
      </div>
    </fieldset>
    <p v-if="error" role="alert" class="mt-2 text-sm">{{ $t('failure.storage') }}</p>
    <button type="submit" :disabled="saving" class="mt-2 rounded border px-3 py-1">
      {{ $t('common.save') }}
    </button>
  </form>
</template>
