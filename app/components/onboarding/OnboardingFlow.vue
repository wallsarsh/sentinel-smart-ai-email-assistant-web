<script setup lang="ts">
import { computed } from 'vue'
import { minutesToTime, timeToMinutes } from '~/utils/time-of-day'
import { nextStep, prevStep, STEPS, stepIndex, type Step } from '~/utils/onboarding'

const props = defineProps<{
  step: Step
  accountCount: number
  aiReady: boolean
  briefMinutes: number
  briefNotify: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  go: [Step]
  skip: []
  finish: []
  brief: [{ 'brief.minutes'?: number; 'brief.notify'?: boolean }]
}>()

const isLast = computed(() => nextStep(props.step) === null)
const back = computed(() => prevStep(props.step))
function next() {
  const n = nextStep(props.step)
  if (n) emit('go', n)
  else emit('finish')
}
function setTime(v: string) {
  const m = timeToMinutes(v)
  if (m !== null) emit('brief', { 'brief.minutes': m })
}
</script>

<template>
  <section class="space-y-5" :aria-labelledby="`ob-${step}`">
    <p class="text-sm" style="color: var(--muted)" data-testid="progress">
      {{ $t('onboarding.progress', { n: stepIndex(step) + 1, total: STEPS.length }) }}
    </p>
    <h1 :id="`ob-${step}`" class="text-2xl font-semibold" tabindex="-1">
      {{ $t(`onboarding.${step}.title`) }}
    </h1>

    <p v-if="step === 'welcome'">{{ $t('onboarding.welcome.body') }}</p>

    <ul v-else-if="step === 'privacy'" class="list-disc space-y-2 pl-5">
      <li>{{ $t('onboarding.privacy.p1') }}</li>
      <li>{{ $t('onboarding.privacy.p2') }}</li>
      <li>{{ $t('onboarding.privacy.p3') }}</li>
    </ul>

    <div v-else-if="step === 'accounts'" class="space-y-3">
      <p>{{ $t('onboarding.accounts.body') }}</p>
      <p role="status" data-testid="accounts-state">
        {{
          accountCount
            ? $t('onboarding.accounts.connected', { n: accountCount })
            : $t('onboarding.accounts.none')
        }}
      </p>
      <NuxtLink to="/settings/accounts" class="inline-block rounded border px-3 py-2 underline">{{
        $t('onboarding.accounts.open')
      }}</NuxtLink>
    </div>

    <div v-else-if="step === 'ai'" class="space-y-3">
      <p>{{ $t('onboarding.ai.body') }}</p>
      <p role="status" data-testid="ai-state">
        {{ aiReady ? $t('onboarding.ai.ready') : $t('onboarding.ai.none') }}
      </p>
      <div class="flex flex-wrap gap-3">
        <NuxtLink to="/settings/ai" class="inline-block rounded border px-3 py-2 underline">{{
          $t('onboarding.ai.open')
        }}</NuxtLink>
        <NuxtLink
          to="/settings/ai/consent"
          class="inline-block rounded border px-3 py-2 underline"
          >{{ $t('onboarding.ai.consent') }}</NuxtLink
        >
      </div>
    </div>

    <div v-else class="space-y-3">
      <p>{{ $t('onboarding.brief.body') }}</p>
      <label class="flex items-center justify-between gap-3">
        <span>{{ $t('bg.briefTime') }}</span>
        <input
          type="time"
          class="rounded border px-2 py-1"
          :value="minutesToTime(briefMinutes)"
          data-testid="brief-time"
          @change="setTime(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="briefNotify"
          data-testid="brief-notify"
          @change="emit('brief', { 'brief.notify': ($event.target as HTMLInputElement).checked })"
        />
        {{ $t('bg.briefNotify') }}
      </label>
      <div>
        <h2 class="font-medium">{{ $t('onboarding.brief.allowPush') }}</h2>
        <slot name="push" />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 pt-2">
      <button
        v-if="back"
        type="button"
        class="rounded border px-4 py-2"
        data-testid="back"
        @click="emit('go', back)"
      >
        {{ $t('onboarding.back') }}
      </button>
      <button
        type="button"
        class="rounded px-4 py-2 font-medium"
        style="background: var(--primary); color: var(--primary-text)"
        :disabled="busy"
        data-testid="next"
        @click="next"
      >
        {{ isLast ? $t('onboarding.finish') : $t('onboarding.next') }}
      </button>
      <button
        type="button"
        class="ml-auto text-sm underline"
        data-testid="skip"
        @click="emit('skip')"
      >
        {{ $t('onboarding.skip') }}
      </button>
    </div>
  </section>
</template>
