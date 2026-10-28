<template>
  <section class="rounded border p-3 text-sm" aria-labelledby="admin-help-title">
    <h3 id="admin-help-title" class="font-semibold">{{ $t('accounts.adminHelp.title') }}</h3>
    <ol class="mt-2 list-decimal space-y-1 pl-5">
      <li>{{ $t('accounts.adminHelp.step1') }}</li>
      <li>{{ $t('accounts.adminHelp.step2') }}</li>
      <li>{{ $t('accounts.adminHelp.step3') }}</li>
    </ol>
  </section>
</template>
