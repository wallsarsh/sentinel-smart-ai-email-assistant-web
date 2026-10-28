export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss', '@nuxt/eslint'],
  typescript: { strict: true, typeCheck: false },
  css: [],
  app: { head: { title: 'Sentinel', htmlAttrs: { lang: 'en' } } },
})
