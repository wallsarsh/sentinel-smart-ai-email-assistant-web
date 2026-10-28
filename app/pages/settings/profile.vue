<script setup lang="ts">
import { ref } from 'vue'

type Profile = {
  name: string
  timezone: string
  role: string
  signOff: string
  signature: string
  styleNotes: string
  language: string
}
const { data } = await useFetch<Profile>('/api/profile')
const form = ref<Profile>({
  name: '',
  timezone: 'UTC',
  role: '',
  signOff: '',
  signature: '',
  styleNotes: '',
  language: '',
  ...data.value,
})
const state = ref<'idle' | 'saved' | 'error'>('idle')

async function save() {
  state.value = 'idle'
  try {
    await $fetch('/api/profile', { method: 'PUT', body: form.value })
    state.value = 'saved'
  } catch {
    state.value = 'error'
  }
}
</script>

<template>
  <section class="max-w-2xl space-y-4">
    <h1 class="text-2xl font-semibold">{{ $t('profile.title') }}</h1>
    <p class="text-sm" style="color: var(--muted)">{{ $t('profile.intro') }}</p>
    <form class="grid gap-3 md:grid-cols-2" @submit.prevent="save">
      <div>
        <label for="pf-name" class="block text-sm font-medium">{{ $t('profile.name') }}</label
        ><input
          id="pf-name"
          v-model="form.name"
          maxlength="80"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="pf-role" class="block text-sm font-medium">{{ $t('profile.role') }}</label
        ><input
          id="pf-role"
          v-model="form.role"
          maxlength="80"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="pf-tz" class="block text-sm font-medium">{{ $t('profile.timezone') }}</label
        ><input
          id="pf-tz"
          v-model="form.timezone"
          maxlength="60"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="pf-lang" class="block text-sm font-medium">{{ $t('profile.language') }}</label
        ><input
          id="pf-lang"
          v-model="form.language"
          maxlength="20"
          :placeholder="$t('profile.languageAuto')"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="pf-signoff" class="block text-sm font-medium">{{ $t('profile.signOff') }}</label
        ><input
          id="pf-signoff"
          v-model="form.signOff"
          maxlength="80"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div>
        <label for="pf-style" class="block text-sm font-medium">{{
          $t('profile.styleNotes')
        }}</label
        ><input
          id="pf-style"
          v-model="form.styleNotes"
          maxlength="300"
          class="w-full rounded border px-2 py-1"
        >
      </div>
      <div class="md:col-span-2">
        <label for="pf-sig" class="block text-sm font-medium">{{ $t('profile.signature') }}</label>
        <textarea
          id="pf-sig"
          v-model="form.signature"
          rows="4"
          maxlength="1000"
          class="w-full rounded border px-2 py-1"
        />
        <p class="text-xs" style="color: var(--muted)">{{ $t('profile.signatureHint') }}</p>
      </div>
      <div class="flex items-center gap-3 md:col-span-2">
        <button type="submit" class="rounded border px-3 py-1 font-medium">
          {{ $t('common.save') }}
        </button>
        <span v-if="state === 'saved'" role="status" class="text-sm">{{
          $t('ai.routes.saved')
        }}</span>
        <span v-if="state === 'error'" role="alert" class="text-sm">{{
          $t('failure.validation.generic')
        }}</span>
      </div>
    </form>
  </section>
</template>
