<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { WireFailure } from '../../utils/failure-presenter'

const emit = defineEmits<{ added: []; cancel: [] }>()

type Settings = {
  imapHost: string
  imapPort: number
  imapSecurity: 'implicit_tls' | 'start_tls'
  username: string
  smtpHost: string
  smtpPort: number
  smtpSecurity: 'implicit_tls' | 'start_tls'
}
const step = ref<'email' | 'details'>('email')
const email = ref('')
const password = ref('')
const appPassword = ref(false)
const busy = ref(false)
const failure = ref<WireFailure | null>(null)
const s = reactive<Settings>({
  imapHost: '',
  imapPort: 993,
  imapSecurity: 'implicit_tls',
  username: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecurity: 'implicit_tls',
})

const fail = (e: unknown) => {
  const data = (e as { data?: { error?: WireFailure } })?.data?.error
  failure.value = data ?? { kind: 'network' }
}

async function lookup() {
  busy.value = true
  failure.value = null
  try {
    const r = await $fetch<{ settings: Settings; appPassword?: boolean }>(
      '/api/accounts/discover',
      { query: { email: email.value } },
    )
    Object.assign(s, r.settings, { username: r.settings.username || email.value })
    appPassword.value = Boolean(r.appPassword)
    step.value = 'details'
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const body = () => ({ email: email.value, password: password.value, settings: { ...s } })
const tested = ref(false)

async function test() {
  busy.value = true
  failure.value = null
  tested.value = false
  try {
    await $fetch('/api/accounts/imap/test', { method: 'POST', body: body() })
    tested.value = true
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

async function save() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/accounts/imap', { method: 'POST', body: body() })
    password.value = ''
    emit('added')
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="step === 'email' ? lookup() : save()">
    <h2 class="text-lg font-semibold">{{ $t('accounts.imap.title') }}</h2>
    <FailureBanner v-if="failure" :failure="failure" />

    <div>
      <label for="imap-email" class="block text-sm font-medium">{{
        $t('accounts.imap.email')
      }}</label>
      <input
        id="imap-email"
        v-model="email"
        type="email"
        autocomplete="email"
        required
        class="mt-1 w-full rounded border px-2 py-1"
        :readonly="step === 'details'"
      >
    </div>

    <template v-if="step === 'details'">
      <p v-if="appPassword" class="rounded border p-2 text-sm" role="note">
        {{ $t('accounts.imap.appPassword') }}
      </p>
      <div>
        <label for="imap-password" class="block text-sm font-medium">{{
          $t('accounts.imap.password')
        }}</label>
        <input
          id="imap-password"
          v-model="password"
          type="password"
          autocomplete="off"
          required
          class="mt-1 w-full rounded border px-2 py-1"
        >
      </div>
      <fieldset class="grid gap-2 md:grid-cols-3">
        <legend class="text-sm font-medium">{{ $t('accounts.imap.incoming') }}</legend>
        <div>
          <label for="imap-host" class="block text-sm">{{ $t('accounts.imap.host') }}</label
          ><input
            id="imap-host"
            v-model="s.imapHost"
            required
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div>
          <label for="imap-port" class="block text-sm">{{ $t('accounts.imap.port') }}</label
          ><input
            id="imap-port"
            v-model.number="s.imapPort"
            type="number"
            min="1"
            max="65535"
            required
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div>
          <label for="imap-sec" class="block text-sm">{{ $t('accounts.imap.security') }}</label>
          <select id="imap-sec" v-model="s.imapSecurity" class="w-full rounded border px-2 py-1">
            <option value="implicit_tls">{{ $t('accounts.imap.tls') }}</option>
            <option value="start_tls">{{ $t('accounts.imap.starttls') }}</option>
          </select>
        </div>
        <div class="md:col-span-3">
          <label for="imap-user" class="block text-sm">{{ $t('accounts.imap.username') }}</label
          ><input
            id="imap-user"
            v-model="s.username"
            required
            class="w-full rounded border px-2 py-1"
          >
        </div>
      </fieldset>
      <fieldset class="grid gap-2 md:grid-cols-3">
        <legend class="text-sm font-medium">{{ $t('accounts.imap.outgoing') }}</legend>
        <div>
          <label for="smtp-host" class="block text-sm">{{ $t('accounts.imap.host') }}</label
          ><input
            id="smtp-host"
            v-model="s.smtpHost"
            required
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div>
          <label for="smtp-port" class="block text-sm">{{ $t('accounts.imap.port') }}</label
          ><input
            id="smtp-port"
            v-model.number="s.smtpPort"
            type="number"
            min="1"
            max="65535"
            required
            class="w-full rounded border px-2 py-1"
          >
        </div>
        <div>
          <label for="smtp-sec" class="block text-sm">{{ $t('accounts.imap.security') }}</label>
          <select id="smtp-sec" v-model="s.smtpSecurity" class="w-full rounded border px-2 py-1">
            <option value="implicit_tls">{{ $t('accounts.imap.tls') }}</option>
            <option value="start_tls">{{ $t('accounts.imap.starttls') }}</option>
          </select>
        </div>
      </fieldset>
      <p v-if="tested" role="status" class="text-sm">{{ $t('accounts.imap.testOk') }}</p>
    </template>

    <div class="flex gap-2">
      <button
        v-if="step === 'email'"
        type="submit"
        :disabled="busy"
        class="rounded border px-3 py-1 font-medium"
      >
        {{ $t('accounts.imap.continue') }}
      </button>
      <template v-else>
        <button type="button" :disabled="busy" class="rounded border px-3 py-1" @click="test">
          {{ $t('accounts.imap.test') }}
        </button>
        <button type="submit" :disabled="busy" class="rounded border px-3 py-1 font-medium">
          {{ $t('accounts.imap.save') }}
        </button>
      </template>
      <button type="button" class="rounded px-3 py-1" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </form>
</template>
