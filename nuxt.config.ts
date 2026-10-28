export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss', '@nuxt/eslint', '@nuxtjs/i18n'],
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en', file: 'en.json' },
      { code: 'en-XA', language: 'en', file: 'en-XA.json' },
    ],
    detectBrowserLanguage: false,
  },
  typescript: { strict: true, typeCheck: false },
  css: [],
  app: { head: { title: 'Sentinel', htmlAttrs: { lang: 'en' } } },
})
